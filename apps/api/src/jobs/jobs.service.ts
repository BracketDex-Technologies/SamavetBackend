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
    // SKIP LOCKED makes this safe when several API/worker instances scale out.
    const [claimed] = await this.prisma.$queryRaw<Array<{ id: string }>>`
      WITH candidate AS (
        SELECT id
        FROM "background_jobs"
        WHERE status = 'QUEUED'
          AND "run_after" <= now()
          AND attempts < "max_attempts"
        ORDER BY "run_after" ASC, "created_at" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE "background_jobs" AS job
      SET attempts = job.attempts + 1,
          "locked_at" = now(),
          "locked_by" = ${workerId},
          "started_at" = now(),
          status = 'PROCESSING',
          "updated_at" = now()
      FROM candidate
      WHERE job.id = candidate.id
      RETURNING job.id
    `;
    return claimed ? this.prisma.backgroundJob.findUnique({ where: { id: claimed.id } }) : null;
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
