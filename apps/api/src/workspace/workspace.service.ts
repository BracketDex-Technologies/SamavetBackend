import { Injectable, NotFoundException } from '@nestjs/common';
import { AccountStatus, ExpenseStatus, FestivalStatus, Prisma, SlipStatus, UserRole } from '@prisma/client';
import { AuthContext } from '../auth/auth-context';
import { ensureDefaultMandalWorkspace } from '../mandals/mandal-defaults';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WorkspaceService {
  constructor(private readonly prisma: PrismaService) {}

  async bootstrap(ctx: AuthContext) {
    if (ctx.role === UserRole.SUPER_ADMIN) {
      return this.bootstrapOwner(ctx);
    }

    if (!ctx.mandalId) {
      throw new NotFoundException('Mandal workspace not found.');
    }

    return this.bootstrapMandal(ctx);
  }

  async summary(ctx: AuthContext) {
    if (ctx.role === UserRole.SUPER_ADMIN) {
      const [totalMandals, totalMembers, totalSlips] = await this.prisma.$transaction([
        this.prisma.mandal.count({ where: { status: AccountStatus.ACTIVE } }),
        this.prisma.member.count({ where: { status: AccountStatus.ACTIVE } }),
        this.prisma.varganiSlip.count({ where: { status: SlipStatus.ACTIVE } }),
      ]);

      return {
        generatedAt: new Date().toISOString(),
        kind: 'OWNER',
        metrics: { totalMandals, totalMembers, totalSlips },
      };
    }

    if (!ctx.mandalId) {
      throw new NotFoundException('Mandal workspace not found.');
    }

    const mandalId = ctx.mandalId;
    const activeFestival = await this.prisma.festival.findFirst({
      orderBy: { startDate: 'desc' },
      select: { id: true },
      where: { mandalId, status: FestivalStatus.ACTIVE },
    });

    if (!activeFestival) {
      return {
        generatedAt: new Date().toISOString(),
        kind: 'MANDAL',
        metrics: emptyMandalMetrics(),
      };
    }

    const [activeSlipAmount, pendingSlipAmount, approvedExpenseAmount, paidCollectors, memberTotal] =
      await this.prisma.$transaction([
        this.prisma.varganiSlip.aggregate({
          _count: { id: true },
          _sum: { amount: true },
          where: { festivalId: activeFestival.id, mandalId, status: SlipStatus.ACTIVE },
        }),
        this.prisma.varganiSlip.aggregate({
          _count: { id: true },
          _sum: { amount: true },
          where: { festivalId: activeFestival.id, mandalId, status: SlipStatus.PENDING },
        }),
        this.prisma.expense.aggregate({
          _count: { id: true },
          _sum: { amount: true },
          where: { festivalId: activeFestival.id, mandalId, status: ExpenseStatus.APPROVED },
        }),
        this.prisma.varganiSlip.findMany({
          distinct: ['collectedByUserId'],
          select: { collectedByUserId: true },
          where: { festivalId: activeFestival.id, mandalId, status: SlipStatus.ACTIVE },
        }),
        this.prisma.member.count({ where: { festivalId: activeFestival.id, mandalId } }),
      ]);

    const totalCollection = Number(activeSlipAmount._sum.amount ?? 0);
    const totalExpenses = Number(approvedExpenseAmount._sum.amount ?? 0);
    const memberPaidCount = paidCollectors.length;

    return {
      generatedAt: new Date().toISOString(),
      kind: 'MANDAL',
      metrics: {
        balance: totalCollection - totalExpenses,
        memberPaidCount,
        memberPendingAmount: Math.max(0, Number(pendingSlipAmount._sum.amount ?? 0)),
        memberPendingCount: Math.max(0, memberTotal - memberPaidCount),
        memberTotal,
        slipPaidAmount: totalCollection,
        slipPaidCount: activeSlipAmount._count.id,
        slipPendingAmount: Number(pendingSlipAmount._sum.amount ?? 0),
        slipPendingCount: pendingSlipAmount._count.id,
        totalExpenses,
      },
    };
  }

  private async bootstrapOwner(ctx: AuthContext) {
    await this.ensureOwnerMandalsReady(ctx.userId);

    const [mandalRows, totalMandals, totalMembers, totalSlips] = await this.prisma.$transaction([
      this.prisma.mandal.findMany({
        include: {
          _count: {
            select: {
              members: true,
              slips: true,
              users: true,
            },
          },
          users: {
            orderBy: { createdAt: 'asc' },
            select: {
              createdAt: true,
              email: true,
              id: true,
              lastLoginAt: true,
              name: true,
              phone: true,
              role: true,
              status: true,
            },
          },
          festivals: {
            orderBy: { startDate: 'desc' },
            select: {
              id: true,
              name: true,
              status: true,
              targetAmount: true,
              templates: {
                include: {
                  versions: {
                    orderBy: { version: 'desc' },
                    where: { isActive: true },
                  },
                },
                orderBy: { updatedAt: 'desc' },
                take: 1,
              },
              type: true,
            },
            take: 1,
            where: { status: FestivalStatus.ACTIVE },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 24,
        where: { status: AccountStatus.ACTIVE },
      }),
      this.prisma.mandal.count({ where: { status: AccountStatus.ACTIVE } }),
      this.prisma.member.count({ where: { status: AccountStatus.ACTIVE } }),
      this.prisma.varganiSlip.count({ where: { status: SlipStatus.ACTIVE } }),
    ]);

    return {
      kind: 'OWNER',
      generatedAt: new Date().toISOString(),
      mandals: {
        items: mandalRows,
        meta: {
          limit: 24,
          page: 1,
          total: totalMandals,
          totalPages: Math.ceil(totalMandals / 24),
        },
      },
      metrics: {
        totalMandals,
        totalMembers,
        totalSlips,
      },
      user: await this.getUser(ctx.userId),
    };
  }

  private async bootstrapMandal(ctx: AuthContext) {
    const mandalId = ctx.mandalId as string;
    const mandal = await this.prisma.mandal.findUnique({
      where: { id: mandalId },
    });

    if (!mandal) {
      throw new NotFoundException('Mandal workspace not found.');
    }

    let activeFestival = await this.prisma.festival.findFirst({
      orderBy: { startDate: 'desc' },
      where: { mandalId, status: FestivalStatus.ACTIVE },
    });

    if (!activeFestival) {
      const setup = await this.prisma.$transaction((tx) =>
        ensureDefaultMandalWorkspace(tx, {
          createdByUserId: ctx.userId,
          mandalId,
        }),
      );
      activeFestival = setup.activeFestival;
    }

    await this.repairGroupLeaderAssignments(mandalId, activeFestival.id);

    const isCollectorWorkspace = ctx.role === UserRole.MEMBER || ctx.role === UserRole.GROUP_LEADER;
    const visibleSlipWhere: Prisma.VarganiSlipWhereInput = {
      collectedByUserId: isCollectorWorkspace ? ctx.userId : undefined,
      festivalId: activeFestival.id,
      mandalId,
    };
    const activeSlipWhere: Prisma.VarganiSlipWhereInput = {
      ...visibleSlipWhere,
      status: SlipStatus.ACTIVE,
    };
    const pendingSlipWhere: Prisma.VarganiSlipWhereInput = {
      ...visibleSlipWhere,
      status: SlipStatus.PENDING,
    };
    const memberCountWhere: Prisma.MemberWhereInput = {
      festivalId: activeFestival.id,
      mandalId,
      userId: isCollectorWorkspace ? ctx.userId : undefined,
    };

    const [
      currentMember,
      customFields,
      groups,
      members,
      templates,
      slips,
      slipTotal,
      activeSlipAmount,
      pendingSlipAmount,
      approvedExpenseAmount,
      paidCollectors,
      collectionSlips,
      memberTotal,
      users,
      auditEvents,
    ] = await this.prisma.$transaction([
      this.prisma.member.findFirst({
        include: { group: true },
        where: { festivalId: activeFestival.id, mandalId, userId: ctx.userId },
      }),
      this.prisma.customField.findMany({
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        where: { festivalId: activeFestival.id, mandalId },
      }),
      this.prisma.memberGroup.findMany({
        include: {
          leader: { select: { id: true, name: true, phone: true } },
          members: {
            orderBy: { displayName: 'asc' },
            select: {
              areaName: true,
              displayName: true,
              id: true,
              phone: true,
              user: { select: { id: true, name: true, phone: true, role: true, status: true } },
              userId: true,
            },
          },
          _count: { select: { members: true, slips: true } },
        },
        orderBy: { name: 'asc' },
        where: {
          festivalId: activeFestival.id,
          mandalId,
          members: isCollectorWorkspace ? { some: { userId: ctx.userId } } : undefined,
        },
      }),
      this.prisma.member.findMany({
        include: {
          group: { select: { areaName: true, id: true, name: true } },
          user: {
            select: { email: true, id: true, name: true, phone: true, role: true, status: true },
          },
        },
        orderBy: { displayName: 'asc' },
        take: 100,
        where: {
          festivalId: activeFestival.id,
          mandalId,
          userId: isCollectorWorkspace ? ctx.userId : undefined,
        },
      }),
      this.prisma.slipTemplate.findMany({
        include: {
          versions: {
            orderBy: { version: 'desc' },
          },
        },
        orderBy: { updatedAt: 'desc' },
        where: { festivalId: activeFestival.id, mandalId },
      }),
      this.prisma.varganiSlip.findMany({
        include: {
          collector: { select: { id: true, name: true, phone: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 25,
        where: visibleSlipWhere,
      }),
      this.prisma.varganiSlip.count({ where: visibleSlipWhere }),
      this.prisma.varganiSlip.aggregate({
        _count: { id: true },
        _sum: { amount: true },
        where: activeSlipWhere,
      }),
      this.prisma.varganiSlip.aggregate({
        _count: { id: true },
        _sum: { amount: true },
        where: pendingSlipWhere,
      }),
      this.prisma.expense.aggregate({
        _count: { id: true },
        _sum: { amount: true },
        where: { festivalId: activeFestival.id, mandalId, status: ExpenseStatus.APPROVED },
      }),
      this.prisma.varganiSlip.findMany({
        distinct: ['collectedByUserId'],
        select: { collectedByUserId: true },
        where: activeSlipWhere,
      }),
      this.prisma.varganiSlip.findMany({
        select: {
          amount: true,
          collectedByUserId: true,
          groupId: true,
        },
        where: activeSlipWhere,
      }),
      this.prisma.member.count({ where: memberCountWhere }),
      this.prisma.user.findMany({
        orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
        select: {
          createdAt: true,
          email: true,
          id: true,
          lastLoginAt: true,
          name: true,
          phone: true,
          role: true,
          status: true,
        },
        take: 50,
        where: isCollectorWorkspace ? { id: ctx.userId, mandalId } : { mandalId },
      }),
      this.prisma.auditEvent.findMany({
        orderBy: { createdAt: 'desc' },
        take: 25,
        where: { mandalId },
      }),
    ]);

    const totalCollection = Number(activeSlipAmount._sum.amount ?? 0);
    const totalExpenses = Number(approvedExpenseAmount._sum.amount ?? 0);
    const memberPaidCount = paidCollectors.length;
    const groupStats = new Map<string, { collectionTotal: number; paidSlipCount: number }>();
    const memberStats = new Map<string, { collectionTotal: number; paidSlipCount: number }>();

    collectionSlips.forEach((slip) => {
      const amount = Number(slip.amount ?? 0);
      if (slip.groupId) {
        const current = groupStats.get(slip.groupId) ?? { collectionTotal: 0, paidSlipCount: 0 };
        groupStats.set(slip.groupId, {
          collectionTotal: current.collectionTotal + amount,
          paidSlipCount: current.paidSlipCount + 1,
        });
      }

      const current = memberStats.get(slip.collectedByUserId) ?? { collectionTotal: 0, paidSlipCount: 0 };
      memberStats.set(slip.collectedByUserId, {
        collectionTotal: current.collectionTotal + amount,
        paidSlipCount: current.paidSlipCount + 1,
      });
    });
    const groupsWithStats = groups.map((group) => ({
      ...group,
      collectionTotal: groupStats.get(group.id)?.collectionTotal ?? 0,
      paidSlipCount: groupStats.get(group.id)?.paidSlipCount ?? 0,
    }));
    const membersWithStats = members.map((member) => ({
      ...member,
      collectionTotal: memberStats.get(member.userId)?.collectionTotal ?? 0,
      paidSlipCount: memberStats.get(member.userId)?.paidSlipCount ?? 0,
    }));

    return {
      activeForm: {
        customFields,
        festival: activeFestival,
        member: currentMember,
        systemFields: [
          'contributorName',
          'contributorPhone',
          'contributorAddress',
          'shopName',
          'amount',
          'paymentMode',
          'areaName',
        ],
      },
      auditEvents,
      festival: activeFestival,
      generatedAt: new Date().toISOString(),
      groups: groupsWithStats,
      kind: 'MANDAL',
      mandal,
      members: membersWithStats,
      metrics: {
        balance: totalCollection - totalExpenses,
        memberPaidCount,
        memberPendingAmount: Math.max(0, Number(pendingSlipAmount._sum.amount ?? 0)),
        memberPendingCount: Math.max(0, memberTotal - memberPaidCount),
        memberTotal,
        slipPaidAmount: totalCollection,
        slipPaidCount: activeSlipAmount._count.id,
        slipPendingAmount: Number(pendingSlipAmount._sum.amount ?? 0),
        slipPendingCount: pendingSlipAmount._count.id,
        totalExpenses,
      },
      report: {
        balance: totalCollection - totalExpenses,
        byGroup: groupsWithStats.map((group) => ({
          groupId: group.id,
          groupName: group.name,
          slipCount: group.paidSlipCount,
          totalAmount: group.collectionTotal,
        })),
        byMember: membersWithStats.map((member) => ({
          memberId: member.id,
          memberName: member.displayName,
          slipCount: member.paidSlipCount,
          totalAmount: member.collectionTotal,
        })),
        byPaymentMode: [],
        slipCount: activeSlipAmount._count.id,
        totalCollection,
        totalExpenses,
      },
      slips: {
        items: slips,
        meta: {
          limit: 25,
          page: 1,
          total: slipTotal,
          totalPages: Math.ceil(slipTotal / 25),
        },
      },
      templates,
      user: await this.getUser(ctx.userId),
      users,
    };
  }

  private async repairGroupLeaderAssignments(mandalId: string, festivalId: string) {
    const groups = await this.prisma.memberGroup.findMany({
      select: { id: true, leaderUserId: true },
      where: {
        festivalId,
        leaderUserId: { not: null },
        mandalId,
      },
    });

    await this.prisma.$transaction(async (tx) => {
      const validLeaderUserIds: string[] = [];

      for (const group of groups) {
        if (!group.leaderUserId) continue;

        const leaderMember = await tx.member.findFirst({
          where: {
            festivalId,
            mandalId,
            userId: group.leaderUserId,
          },
        });

        if (!leaderMember) {
          await tx.memberGroup.update({
            data: { leaderUserId: null },
            where: { id: group.id },
          });
          continue;
        }

        validLeaderUserIds.push(group.leaderUserId);

        if (leaderMember.groupId !== group.id) {
          await tx.member.update({
            data: { groupId: group.id },
            where: { id: leaderMember.id },
          });
        }

        await tx.user.update({
          data: { role: UserRole.GROUP_LEADER },
          where: { id: group.leaderUserId },
        });
      }

      const downgradeWhere: Prisma.UserWhereInput = {
        mandalId,
        memberProfiles: { some: { festivalId, mandalId } },
        role: UserRole.GROUP_LEADER,
      };
      if (validLeaderUserIds.length > 0) {
        downgradeWhere.id = { notIn: validLeaderUserIds };
      }

      await tx.user.updateMany({
        data: { role: UserRole.MEMBER },
        where: downgradeWhere,
      });
    });
  }

  private getUser(userId: string) {
    return this.prisma.user.findUnique({
      select: {
        createdAt: true,
        email: true,
        id: true,
        lastLoginAt: true,
        mandalId: true,
        name: true,
        phone: true,
        role: true,
        status: true,
      },
      where: { id: userId },
    });
  }

  private async ensureOwnerMandalsReady(createdByUserId: string) {
    const mandalsWithoutActiveFestival = await this.prisma.mandal.findMany({
      select: { id: true },
      take: 24,
      where: {
        festivals: {
          none: {
            status: FestivalStatus.ACTIVE,
          },
        },
        status: AccountStatus.ACTIVE,
      },
    });

    for (const mandal of mandalsWithoutActiveFestival) {
      await this.prisma.$transaction((tx) =>
        ensureDefaultMandalWorkspace(tx, {
          createdByUserId,
          mandalId: mandal.id,
        }),
      );
    }
  }
}

function emptyReport() {
  return {
    balance: 0,
    byGroup: [],
    byMember: [],
    byPaymentMode: [],
    slipCount: 0,
    totalCollection: 0,
    totalExpenses: 0,
  };
}

function emptyMandalMetrics() {
  return {
    balance: 0,
    memberPaidCount: 0,
    memberPendingAmount: 0,
    memberPendingCount: 0,
    memberTotal: 0,
    slipPaidAmount: 0,
    slipPaidCount: 0,
    slipPendingAmount: 0,
    slipPendingCount: 0,
    totalExpenses: 0,
  };
}
