import { Injectable, NotFoundException } from '@nestjs/common';
import { TaskPriority, TaskStatus } from '@prisma/client';
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

    const task = await this.prisma.festivalTask.create({
      data: {
        assigneeUserId: dto.assigneeUserId,
        createdBy: ctx.userId,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        festivalId,
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

    return this.prisma.festivalTask.findMany({
      include: this.includeRelations(),
      orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
      where: { festivalId, mandalId },
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

    const task = await this.prisma.festivalTask.update({
      data: {
        assigneeUserId: dto.assigneeUserId,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
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
    };
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
