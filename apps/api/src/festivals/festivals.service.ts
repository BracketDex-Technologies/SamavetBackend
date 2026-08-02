import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountStatus, FestivalStatus, Prisma, TemplateStatus } from '@prisma/client';
import { AuthContext } from '../auth/auth-context';
import { assertSameMandal } from '../auth/tenant-scope';
import { ensureDefaultMandalWorkspace, ganpatiFestivalWindow } from '../mandals/mandal-defaults';
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

  async activateYear(ctx: AuthContext, mandalId: string, year: number) {
    assertSameMandal(ctx, mandalId);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      throw new BadRequestException('Festival year must be between 2000 and 2100.');
    }

    const yearStart = new Date(Date.UTC(year, 0, 1));
    const nextYearStart = new Date(Date.UTC(year + 1, 0, 1));

    return this.prisma.$transaction(async (tx) => {
      let festival = await tx.festival.findFirst({
        orderBy: { startDate: 'desc' },
        where: { mandalId, startDate: { gte: yearStart, lt: nextYearStart } },
      });

      if (!festival) {
        const sourceFestival = await tx.festival.findFirst({
          orderBy: { startDate: 'desc' },
          where: { mandalId },
        });

        if (sourceFestival) {
          festival = await this.createYearFromFestival(tx, ctx, mandalId, year, sourceFestival.id);
        } else {
          const setup = await ensureDefaultMandalWorkspace(tx, {
            createdByUserId: ctx.userId,
            festivalYear: year,
            mandalId,
          });
          festival = setup.activeFestival;
        }
      }

      await tx.festival.updateMany({
        data: { status: FestivalStatus.COMPLETED },
        where: { id: { not: festival.id }, mandalId, status: FestivalStatus.ACTIVE },
      });

      return tx.festival.update({
        data: { status: FestivalStatus.ACTIVE },
        where: { id: festival.id },
      });
    });
  }

  private async createYearFromFestival(
    tx: Prisma.TransactionClient,
    ctx: AuthContext,
    mandalId: string,
    year: number,
    sourceFestivalId: string,
  ) {
    const [customFields, groups, members, sourceTemplate] = await Promise.all([
      tx.customField.findMany({
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        where: { festivalId: sourceFestivalId, mandalId },
      }),
      tx.memberGroup.findMany({
        orderBy: { createdAt: 'asc' },
        where: { festivalId: sourceFestivalId, mandalId },
      }),
      tx.member.findMany({
        orderBy: { createdAt: 'asc' },
        where: {
          festivalId: sourceFestivalId,
          mandalId,
          status: AccountStatus.ACTIVE,
          user: { status: AccountStatus.ACTIVE },
        },
      }),
      tx.slipTemplate.findFirst({
        include: {
          versions: {
            orderBy: { version: 'desc' },
            take: 1,
            where: { isActive: true },
          },
        },
        orderBy: { updatedAt: 'desc' },
        where: { festivalId: sourceFestivalId, mandalId },
      }),
    ]);

    let festival = await tx.festival.create({
      data: {
        ...ganpatiFestivalWindow(year),
        mandalId,
        status: FestivalStatus.DRAFT,
      },
    });

    if (customFields.length > 0) {
      await tx.customField.createMany({
        data: customFields.map((field) => ({
          dashboardFilter: field.dashboardFilter,
          festivalId: festival.id,
          key: field.key,
          label: field.label,
          mandalId,
          options: field.options === null ? Prisma.JsonNull : field.options as Prisma.InputJsonValue,
          printOnSlip: field.printOnSlip,
          required: field.required,
          sortOrder: field.sortOrder,
          type: field.type,
        })),
      });
    }

    const groupIds = new Map<string, string>();
    for (const group of groups) {
      const created = await tx.memberGroup.create({
        data: {
          areaName: group.areaName,
          festivalId: festival.id,
          leaderUserId: group.leaderUserId,
          mandalId,
          name: group.name,
        },
      });
      groupIds.set(group.id, created.id);
    }

    if (members.length > 0) {
      await tx.member.createMany({
        data: members.map((member) => ({
          areaName: member.areaName,
          displayName: member.displayName,
          festivalId: festival.id,
          groupId: member.groupId ? groupIds.get(member.groupId) ?? null : null,
          mandalId,
          phone: member.phone,
          status: AccountStatus.ACTIVE,
          userId: member.userId,
        })),
      });
    }

    const sourceVersion = sourceTemplate?.versions[0];
    if (sourceTemplate && sourceVersion) {
      const template = await tx.slipTemplate.create({
        data: {
          createdBy: ctx.userId,
          festivalId: festival.id,
          mandalId,
          name: sourceTemplate.name,
          status: TemplateStatus.ACTIVE,
        },
      });
      const version = await tx.slipTemplateVersion.create({
        data: {
          backgroundFileUrl: sourceVersion.backgroundFileUrl,
          canvasHeight: sourceVersion.canvasHeight,
          canvasWidth: sourceVersion.canvasWidth,
          isActive: true,
          renderConfig: sourceVersion.renderConfig as Prisma.InputJsonValue,
          templateId: template.id,
          version: 1,
        },
      });
      festival = await tx.festival.update({
        data: { activeTemplateVersionId: version.id },
        where: { id: festival.id },
      });
    } else {
      const setup = await ensureDefaultMandalWorkspace(tx, {
        createdByUserId: ctx.userId,
        festivalYear: year,
        mandalId,
      });
      festival = setup.activeFestival;
    }

    return festival;
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
