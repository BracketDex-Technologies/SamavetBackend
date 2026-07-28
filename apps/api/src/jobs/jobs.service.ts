import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type JsonWriteValue = never;

interface EnqueueJobInput {
  mandalId?: string | null;
  payload?: Record<string, unknown>;
  runAfter?: Date;
  type: string;
}

@Injectable()
export class JobsService {
  constructor(private readonly prisma: PrismaService) {}

  async enqueue(input: EnqueueJobInput) {
    return this.prisma.backgroundJob.create({
      data: {
        mandalId: input.mandalId ?? null,
        payload: toJsonWriteValue(input.payload ?? {}),
        runAfter: input.runAfter ?? new Date(),
        type: input.type,
      },
    });
  }

  async listRecent(mandalId?: string | null) {
    return this.prisma.backgroundJob.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      where: mandalId ? { mandalId } : undefined,
    });
  }

  async claimNext(workerId: string) {
    const [job] = await this.prisma.$transaction(async (tx) => {
      const candidates = await tx.backgroundJob.findMany({
        orderBy: [{ runAfter: 'asc' }, { createdAt: 'asc' }],
        take: 1,
        where: {
          attempts: { lt: 3 },
          runAfter: { lte: new Date() },
          status: 'QUEUED',
        },
      });
      const candidate = candidates[0];
      if (!candidate) return [];

      return [
        await tx.backgroundJob.update({
          data: {
            attempts: { increment: 1 },
            lockedAt: new Date(),
            lockedBy: workerId,
            startedAt: new Date(),
            status: 'PROCESSING',
          },
          where: { id: candidate.id },
        }),
      ];
    });

    return job ?? null;
  }

  async complete(id: string) {
    return this.prisma.backgroundJob.update({
      data: {
        completedAt: new Date(),
        lastError: null,
        status: 'COMPLETED',
      },
      where: { id },
    });
  }

  async fail(id: string, error: unknown) {
    const job = await this.prisma.backgroundJob.findUnique({ where: { id } });
    const status = job && job.attempts >= job.maxAttempts ? 'FAILED' : 'QUEUED';
    return this.prisma.backgroundJob.update({
      data: {
        failedAt: status === 'FAILED' ? new Date() : null,
        lastError: error instanceof Error ? error.message : String(error),
        lockedAt: null,
        lockedBy: null,
        runAfter: new Date(Date.now() + 60_000),
        status,
      },
      where: { id },
    });
  }
}

function toJsonWriteValue(value: unknown): JsonWriteValue {
  return value as JsonWriteValue;
}
