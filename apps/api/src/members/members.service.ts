import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountStatus, UserRole } from '@prisma/client';
import argon2 from 'argon2';
import { AuthContext } from '../auth/auth-context';
import { assertSameMandal } from '../auth/tenant-scope';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { CreateMemberDto } from './dto/create-member.dto';
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

    return this.prisma.memberGroup.create({
      data: {
        areaName: dto.areaName,
        festivalId,
        leaderUserId: dto.leaderUserId,
        mandalId,
        name: dto.name,
      },
    });
  }

  async listGroups(ctx: AuthContext, mandalId: string, festivalId: string) {
    assertSameMandal(ctx, mandalId);

    return this.prisma.memberGroup.findMany({
      include: {
        leader: { select: { id: true, name: true, phone: true } },
        _count: { select: { members: true, slips: true } },
      },
      orderBy: { name: 'asc' },
      where: { festivalId, mandalId },
    });
  }

  async createMember(ctx: AuthContext, mandalId: string, festivalId: string, dto: CreateMemberDto) {
    assertSameMandal(ctx, mandalId);

    if (!allowedMemberRoles.has(dto.role)) {
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
          role: dto.role,
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

    if (dto.role && !allowedMemberRoles.has(dto.role)) {
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
          role: dto.role,
          status: dto.status,
        },
        where: { id: before.userId },
      });

      const member = await tx.member.update({
        data: {
          areaName: dto.areaName,
          displayName: dto.name,
          groupId: dto.groupId,
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

  private toJson(value: unknown): JsonWriteValue {
    return value as JsonWriteValue;
  }
}
