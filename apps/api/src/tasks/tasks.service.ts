import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountStatus, Prisma, TaskPriority, TaskStatus, UserRole } from '@prisma/client';
import { AuthContext } from '../auth/auth-context';
import { assertSameMandal } from '../auth/tenant-scope';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

type JsonWriteValue = never;

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  async createTask(ctx: AuthContext, mandalId: string, festivalId: string, dto: CreateTaskDto) {
    assertSameMandal(ctx, mandalId);
    this.assertCanManageTasks(ctx);

    const task = await this.prisma.festivalTask.create({
      data: {
        assigneeUserId: dto.assigneeUserId,
        createdBy: ctx.userId,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        festivalId,
        groupId: dto.groupId,
        mandalId,
        notes: dto.notes,
        priority: dto.priority ?? TaskPriority.MEDIUM,
        status: dto.status ?? TaskStatus.OPEN,
        title: dto.title,
      },
      include: this.includeRelations(),
    });

    await this.audit(ctx, mandalId, task.id, 'task_created', null, task);
    return task;
  }

  async listTasks(ctx: AuthContext, mandalId: string, festivalId: string) {
    assertSameMandal(ctx, mandalId);
    const where: Prisma.FestivalTaskWhereInput = { festivalId, mandalId };

    if (this.isCollector(ctx)) {
      const member = await this.prisma.member.findFirst({
        select: { groupId: true },
        where: {
          festivalId,
          mandalId,
          status: AccountStatus.ACTIVE,
          user: { status: AccountStatus.ACTIVE },
          userId: ctx.userId,
        },
      });
      where.OR = [
        { assigneeUserId: ctx.userId },
        ...(member?.groupId ? [{ groupId: member.groupId }] : []),
      ];
    }

    return this.prisma.festivalTask.findMany({
      include: this.includeRelations(),
      orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
      where,
    });
  }

  async updateTask(
    ctx: AuthContext,
    mandalId: string,
    festivalId: string,
    taskId: string,
    dto: UpdateTaskDto,
  ) {
    assertSameMandal(ctx, mandalId);

    const before = await this.prisma.festivalTask.findFirst({
      where: { festivalId, id: taskId, mandalId },
    });

    if (!before) {
      throw new NotFoundException('Task not found.');
    }

    if (this.isCollector(ctx)) {
      await this.assertTaskVisibleToCollector(ctx, mandalId, festivalId, before.groupId, before.assigneeUserId);
    }

    const task = await this.prisma.festivalTask.update({
      data: this.isCollector(ctx)
        ? { status: dto.status ?? before.status }
        : {
            assigneeUserId: dto.assigneeUserId,
            dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
            groupId: dto.groupId,
            notes: dto.notes,
            priority: dto.priority,
            status: dto.status,
            title: dto.title,
          },
      include: this.includeRelations(),
      where: { id: taskId },
    });

    await this.audit(ctx, mandalId, task.id, 'task_updated', before, task);
    return task;
  }

  async deleteTask(ctx: AuthContext, mandalId: string, festivalId: string, taskId: string) {
    assertSameMandal(ctx, mandalId);
    this.assertCanManageTasks(ctx);

    const before = await this.prisma.festivalTask.findFirst({
      where: { festivalId, id: taskId, mandalId },
    });

    if (!before) {
      throw new NotFoundException('Task not found.');
    }

    const deleted = await this.prisma.festivalTask.delete({ where: { id: taskId } });
    await this.audit(ctx, mandalId, taskId, 'task_deleted', before, deleted);
    return { deleted: true, id: taskId };
  }

  private includeRelations() {
    return {
      assignee: { select: { email: true, id: true, name: true, phone: true, role: true } },
      creator: { select: { id: true, name: true, role: true } },
      group: { select: { areaName: true, id: true, name: true } },
    };
  }

  private assertCanManageTasks(ctx: AuthContext) {
    if (this.isCollector(ctx)) {
      throw new ForbiddenException('Only mandal admins can manage tasks.');
    }
  }

  private async assertTaskVisibleToCollector(
    ctx: AuthContext,
    mandalId: string,
    festivalId: string,
    taskGroupId?: string | null,
    assigneeUserId?: string | null,
  ) {
    if (assigneeUserId === ctx.userId) return;
    if (!taskGroupId) {
      throw new ForbiddenException('This task is not assigned to you.');
    }

    const member = await this.prisma.member.findFirst({
      select: { id: true },
      where: {
        festivalId,
        groupId: taskGroupId,
        mandalId,
        status: AccountStatus.ACTIVE,
        user: { status: AccountStatus.ACTIVE },
        userId: ctx.userId,
      },
    });

    if (!member) {
      throw new ForbiddenException('This task is not assigned to your group.');
    }
  }

  private isCollector(ctx: AuthContext) {
    return ctx.role === UserRole.MEMBER || ctx.role === UserRole.GROUP_LEADER;
  }

  private async audit(
    ctx: AuthContext,
    mandalId: string,
    entityId: string,
    action: string,
    before: unknown,
    after: unknown,
  ) {
    await this.prisma.auditEvent.create({
      data: {
        action,
        actorUserId: ctx.userId,
        after: this.toJson(after),
        before: before ? this.toJson(before) : undefined,
        entityId,
        entityType: 'task',
        mandalId,
      },
    });
  }

  private toJson(value: unknown): JsonWriteValue {
    return value as JsonWriteValue;
  }
}
