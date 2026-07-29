import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountStatus, Prisma, UserRole } from '@prisma/client';
import argon2 from 'argon2';
import { AuthContext } from '../auth/auth-context';
import { assertSameMandal } from '../auth/tenant-scope';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { UpdateMemberDto } from './dto/update-member.dto';

type JsonWriteValue = never;

const allowedMemberRoles = new Set<UserRole>([
  UserRole.KHAJINDAR,
  UserRole.GROUP_LEADER,
  UserRole.MEMBER,
]);

@Injectable()
export class MembersService {
  constructor(private readonly prisma: PrismaService) {}

  async createGroup(ctx: AuthContext, mandalId: string, festivalId: string, dto: CreateGroupDto) {
    assertSameMandal(ctx, mandalId);

    return this.prisma.$transaction(async (tx) => {
      const group = await tx.memberGroup.create({
        data: {
          areaName: dto.areaName,
          festivalId,
          mandalId,
          name: dto.name,
        },
      });

      if (dto.leaderUserId) {
        await this.assignGroupLeader(tx, {
          festivalId,
          groupId: group.id,
          leaderUserId: dto.leaderUserId,
          mandalId,
        });
      }

      return tx.memberGroup.findUniqueOrThrow({
        include: this.groupInclude(),
        where: { id: group.id },
      });
    });
  }

  async listGroups(ctx: AuthContext, mandalId: string, festivalId: string) {
    assertSameMandal(ctx, mandalId);

    return this.prisma.memberGroup.findMany({
      include: this.groupInclude(),
      orderBy: { name: 'asc' },
      where: { festivalId, mandalId },
    });
  }

  async updateGroup(
    ctx: AuthContext,
    mandalId: string,
    festivalId: string,
    groupId: string,
    dto: UpdateGroupDto,
  ) {
    assertSameMandal(ctx, mandalId);

    const before = await this.prisma.memberGroup.findFirst({
      where: { festivalId, id: groupId, mandalId },
    });

    if (!before) {
      throw new NotFoundException('Group not found.');
    }

    const data: { areaName?: string | null; name?: string } = {};
    if (Object.prototype.hasOwnProperty.call(dto, 'areaName')) data.areaName = dto.areaName || null;
    if (dto.name) data.name = dto.name;

    const group = await this.prisma.$transaction(async (tx) => {
      await tx.memberGroup.update({
        data,
        where: { id: groupId },
      });

      if (Object.prototype.hasOwnProperty.call(dto, 'leaderUserId')) {
        await this.assignGroupLeader(tx, {
          festivalId,
          groupId,
          leaderUserId: dto.leaderUserId || null,
          mandalId,
          previousLeaderUserId: before.leaderUserId,
        });
      }

      const updatedGroup = await tx.memberGroup.findUniqueOrThrow({
        include: this.groupInclude(),
        where: { id: groupId },
      });

      await tx.auditEvent.create({
        data: {
          action: 'group_updated',
          actorUserId: ctx.userId,
          after: this.toJson(updatedGroup),
          before: this.toJson(before),
          entityId: updatedGroup.id,
          entityType: 'member_group',
          mandalId,
        },
      });

      return updatedGroup;
    });


    return group;
  }

  async createMember(ctx: AuthContext, mandalId: string, festivalId: string, dto: CreateMemberDto) {
    assertSameMandal(ctx, mandalId);

    const role = this.normalizeCreatedMemberRole(dto.role);

    if (!allowedMemberRoles.has(role)) {
      throw new ConflictException('Invalid mandal member role.');
    }

    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: dto.email?.toLowerCase() }, { phone: dto.phone }],
      },
    });

    if (existingUser) {
      throw new ConflictException('Member email or phone already exists.');
    }

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: dto.email?.toLowerCase(),
          mandalId,
          name: dto.name,
          passwordHash: await argon2.hash(dto.password),
          phone: dto.phone,
          role,
          status: AccountStatus.ACTIVE,
        },
      });

      const member = await tx.member.create({
        data: {
          areaName: dto.areaName,
          displayName: dto.name,
          festivalId,
          groupId: dto.groupId,
          mandalId,
          phone: dto.phone,
          status: AccountStatus.ACTIVE,
          userId: user.id,
        },
      });

      await tx.auditEvent.create({
        data: {
          action: 'member_created',
          actorUserId: ctx.userId,
          after: this.toJson({ memberId: member.id, userId: user.id, role: user.role }),
          entityId: member.id,
          entityType: 'member',
          mandalId,
        },
      });

      return {
        member,
        user: {
          email: user.email,
          id: user.id,
          name: user.name,
          phone: user.phone,
          role: user.role,
          status: user.status,
        },
      };
    });
  }

  async listMembers(ctx: AuthContext, mandalId: string, festivalId: string) {
    assertSameMandal(ctx, mandalId);

    return this.prisma.member.findMany({
      include: {
        group: { select: { id: true, name: true, areaName: true } },
        user: {
          select: { id: true, name: true, phone: true, email: true, role: true, status: true },
        },
      },
      orderBy: { displayName: 'asc' },
      where: { festivalId, mandalId },
    });
  }

  async updateMember(
    ctx: AuthContext,
    mandalId: string,
    festivalId: string,
    memberId: string,
    dto: UpdateMemberDto,
  ) {
    assertSameMandal(ctx, mandalId);

    const role = dto.role;

    if (role && !allowedMemberRoles.has(role)) {
      throw new ConflictException('Invalid mandal member role.');
    }

    const before = await this.prisma.member.findFirst({
      include: { user: true },
      where: { festivalId, id: memberId, mandalId },
    });

    if (!before) {
      throw new NotFoundException('Member not found.');
    }

    const uniqueChecks = [
      dto.email ? { email: dto.email.toLowerCase(), id: { not: before.userId } } : null,
      dto.phone ? { phone: dto.phone, id: { not: before.userId } } : null,
    ].filter(Boolean) as Array<{
      email?: string;
      id: { not: string };
      phone?: string;
    }>;

    if (uniqueChecks.length) {
      const existingUser = await this.prisma.user.findFirst({ where: { OR: uniqueChecks } });

      if (existingUser) {
        throw new ConflictException('Member email or phone already exists.');
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        data: {
          email: dto.email?.toLowerCase(),
          name: dto.name,
          passwordHash: dto.password ? await argon2.hash(dto.password) : undefined,
          phone: dto.phone,
          role,
          status: dto.status,
        },
        where: { id: before.userId },
      });

      const member = await tx.member.update({
        data: {
          areaName: dto.areaName,
          displayName: dto.name,
          groupId: Object.prototype.hasOwnProperty.call(dto, 'groupId') ? dto.groupId : undefined,
          phone: dto.phone,
          status: dto.status,
        },
        include: {
          group: { select: { areaName: true, id: true, name: true } },
          user: {
            select: { email: true, id: true, name: true, phone: true, role: true, status: true },
          },
        },
        where: { id: memberId },
      });

      if (Object.prototype.hasOwnProperty.call(dto, 'groupId') && before.user.role === UserRole.GROUP_LEADER) {
        const keepGroupId = member.groupId;
        await tx.memberGroup.updateMany({
          data: { leaderUserId: null },
          where: {
            festivalId,
            leaderUserId: before.userId,
            mandalId,
            ...(keepGroupId ? { id: { not: keepGroupId } } : {}),
          },
        });
      }

      if (before.user.role === UserRole.GROUP_LEADER || dto.role === UserRole.GROUP_LEADER) {
        await this.downgradeLeaderIfUnused(tx, {
          festivalId,
          mandalId,
          userId: before.userId,
        });
      }

      await tx.auditEvent.create({
        data: {
          action: 'member_updated',
          actorUserId: ctx.userId,
          after: this.toJson({ member, userId: user.id }),
          before: this.toJson(before),
          entityId: member.id,
          entityType: 'member',
          mandalId,
        },
      });

      return member;
    });

    return updated;
  }

  async archiveMember(ctx: AuthContext, mandalId: string, festivalId: string, memberId: string) {
    assertSameMandal(ctx, mandalId);

    const before = await this.prisma.member.findFirst({
      include: { user: true },
      where: { festivalId, id: memberId, mandalId },
    });

    if (!before) {
      throw new NotFoundException('Member not found.');
    }

    await this.prisma.$transaction([
      this.prisma.member.update({
        data: { status: AccountStatus.ARCHIVED },
        where: { id: memberId },
      }),
      this.prisma.user.update({
        data: { status: AccountStatus.SUSPENDED },
        where: { id: before.userId },
      }),
      this.prisma.auditEvent.create({
        data: {
          action: 'member_archived',
          actorUserId: ctx.userId,
          before: this.toJson(before),
          entityId: memberId,
          entityType: 'member',
          mandalId,
        },
      }),
    ]);

    return { archived: true, id: memberId };
  }

  private async assignGroupLeader(
    tx: Prisma.TransactionClient,
    params: {
      festivalId: string;
      groupId: string;
      leaderUserId?: string | null;
      mandalId: string;
      previousLeaderUserId?: string | null;
    },
  ) {
    if (!params.leaderUserId) {
      await tx.memberGroup.update({
        data: { leaderUserId: null },
        where: { id: params.groupId },
      });
      await this.downgradeLeaderIfUnused(tx, {
        festivalId: params.festivalId,
        mandalId: params.mandalId,
        userId: params.previousLeaderUserId,
      });
      return;
    }

    const leader = await tx.member.findFirst({
      where: {
        festivalId: params.festivalId,
        mandalId: params.mandalId,
        userId: params.leaderUserId,
      },
    });

    if (!leader) {
      throw new NotFoundException('Group leader must be a member of this mandal.');
    }

    await tx.member.update({
      data: { groupId: params.groupId },
      where: { id: leader.id },
    });
    await tx.user.update({
      data: { role: UserRole.GROUP_LEADER },
      where: { id: params.leaderUserId },
    });
    await tx.memberGroup.update({
      data: { leaderUserId: params.leaderUserId },
      where: { id: params.groupId },
    });
    await this.downgradeLeaderIfUnused(tx, {
      festivalId: params.festivalId,
      mandalId: params.mandalId,
      userId: params.previousLeaderUserId,
    });
  }

  private async downgradeLeaderIfUnused(
    tx: Prisma.TransactionClient,
    params: { festivalId: string; mandalId: string; userId?: string | null },
  ) {
    if (!params.userId) return;

    const ledGroupCount = await tx.memberGroup.count({
      where: {
        festivalId: params.festivalId,
        leaderUserId: params.userId,
        mandalId: params.mandalId,
      },
    });

    if (ledGroupCount > 0) return;

    await tx.user.updateMany({
      data: { role: UserRole.MEMBER },
      where: {
        id: params.userId,
        mandalId: params.mandalId,
        role: UserRole.GROUP_LEADER,
      },
    });
  }

  private normalizeCreatedMemberRole(role: UserRole) {
    return role === UserRole.GROUP_LEADER ? UserRole.MEMBER : role;
  }

  private toJson(value: unknown): JsonWriteValue {
    return value as JsonWriteValue;
  }

  private groupInclude() {
    return {
      leader: { select: { id: true, name: true, phone: true } },
      members: {
        orderBy: { displayName: 'asc' as const },
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
    };
  }
}
