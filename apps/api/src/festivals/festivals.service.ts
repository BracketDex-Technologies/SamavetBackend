import { Injectable, NotFoundException } from '@nestjs/common';
import { FestivalStatus } from '@prisma/client';
import { AuthContext } from '../auth/auth-context';
import { assertSameMandal } from '../auth/tenant-scope';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFestivalDto } from './dto/create-festival.dto';
import { UpdateFestivalStatusDto } from './dto/update-festival-status.dto';

@Injectable()
export class FestivalsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(ctx: AuthContext, mandalId: string, dto: CreateFestivalDto) {
    assertSameMandal(ctx, mandalId);

    return this.prisma.festival.create({
      data: {
        endDate: new Date(dto.endDate),
        mandalId,
        name: dto.name,
        startDate: new Date(dto.startDate),
        targetAmount: dto.targetAmount,
        type: dto.type,
      },
    });
  }

  async list(ctx: AuthContext, mandalId: string) {
    assertSameMandal(ctx, mandalId);

    return this.prisma.festival.findMany({
      orderBy: { startDate: 'desc' },
      where: { mandalId },
    });
  }

  async updateStatus(
    ctx: AuthContext,
    mandalId: string,
    festivalId: string,
    dto: UpdateFestivalStatusDto,
  ) {
    assertSameMandal(ctx, mandalId);

    const festival = await this.prisma.festival.findFirst({
      where: { id: festivalId, mandalId },
    });

    if (!festival) {
      throw new NotFoundException('Festival not found.');
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.status === FestivalStatus.ACTIVE) {
        await tx.festival.updateMany({
          data: { status: FestivalStatus.COMPLETED },
          where: {
            id: { not: festivalId },
            mandalId,
            status: FestivalStatus.ACTIVE,
          },
        });
      }

      return tx.festival.update({
        data: { status: dto.status },
        where: { id: festivalId },
      });
    });
  }
}
