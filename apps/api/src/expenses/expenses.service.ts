import { Injectable, NotFoundException } from '@nestjs/common';
import { ExpenseStatus } from '@prisma/client';
import { AuthContext } from '../auth/auth-context';
import { assertSameMandal } from '../auth/tenant-scope';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExpenseCategoryDto } from './dto/create-expense-category.dto';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { UpdateExpenseStatusDto } from './dto/update-expense-status.dto';

type JsonWriteValue = never;

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  async createCategory(ctx: AuthContext, mandalId: string, dto: CreateExpenseCategoryDto) {
    assertSameMandal(ctx, mandalId);

    return this.prisma.expenseCategory.create({
      data: {
        mandalId,
        name: dto.name,
      },
    });
  }

  async listCategories(ctx: AuthContext, mandalId: string) {
    assertSameMandal(ctx, mandalId);

    return this.prisma.expenseCategory.findMany({
      orderBy: { name: 'asc' },
      where: { mandalId },
    });
  }

  async createExpense(
    ctx: AuthContext,
    mandalId: string,
    festivalId: string,
    dto: CreateExpenseDto,
  ) {
    assertSameMandal(ctx, mandalId);

    return this.prisma.$transaction(async (tx) => {
      const expense = await tx.expense.create({
        data: {
          amount: dto.amount,
          billFileUrl: dto.billFileUrl,
          categoryId: dto.categoryId,
          createdBy: ctx.userId,
          expenseDate: new Date(dto.expenseDate),
          festivalId,
          mandalId,
          notes: dto.notes,
          status: dto.status ?? ExpenseStatus.SUBMITTED,
          vendorName: dto.vendorName,
        },
      });

      await tx.auditEvent.create({
        data: {
          action: 'expense_created',
          actorUserId: ctx.userId,
          after: this.toJson(expense),
          entityId: expense.id,
          entityType: 'expense',
          mandalId,
        },
      });

      return expense;
    });
  }

  async listExpenses(ctx: AuthContext, mandalId: string, festivalId: string) {
    assertSameMandal(ctx, mandalId);

    return this.prisma.expense.findMany({
      include: {
        approver: { select: { id: true, name: true } },
        category: true,
        creator: { select: { id: true, name: true } },
      },
      orderBy: { expenseDate: 'desc' },
      where: { festivalId, mandalId },
    });
  }

  async updateStatus(
    ctx: AuthContext,
    mandalId: string,
    expenseId: string,
    dto: UpdateExpenseStatusDto,
  ) {
    assertSameMandal(ctx, mandalId);

    const expense = await this.prisma.expense.findFirst({
      where: { id: expenseId, mandalId },
    });

    if (!expense) {
      throw new NotFoundException('Expense not found.');
    }

    const updated = await this.prisma.expense.update({
      data: {
        approvedBy: dto.status === ExpenseStatus.APPROVED ? ctx.userId : null,
        status: dto.status,
      },
      where: { id: expenseId },
    });

    await this.audit(ctx, mandalId, expenseId, 'expense_status_updated', expense, updated);
    return updated;
  }

  async updateExpense(
    ctx: AuthContext,
    mandalId: string,
    festivalId: string,
    expenseId: string,
    dto: UpdateExpenseDto,
  ) {
    assertSameMandal(ctx, mandalId);

    const before = await this.prisma.expense.findFirst({
      where: { festivalId, id: expenseId, mandalId },
    });

    if (!before) {
      throw new NotFoundException('Expense not found.');
    }

    const updated = await this.prisma.expense.update({
      data: {
        amount: dto.amount,
        billFileUrl: dto.billFileUrl,
        categoryId: dto.categoryId,
        expenseDate: dto.expenseDate ? new Date(dto.expenseDate) : undefined,
        notes: dto.notes,
        status: dto.status,
        vendorName: dto.vendorName,
      },
      where: { id: expenseId },
    });

    await this.audit(ctx, mandalId, expenseId, 'expense_updated', before, updated);
    return updated;
  }

  async deleteExpense(ctx: AuthContext, mandalId: string, festivalId: string, expenseId: string) {
    assertSameMandal(ctx, mandalId);

    const before = await this.prisma.expense.findFirst({
      where: { festivalId, id: expenseId, mandalId },
    });

    if (!before) {
      throw new NotFoundException('Expense not found.');
    }

    await this.prisma.expense.delete({ where: { id: expenseId } });
    await this.audit(ctx, mandalId, expenseId, 'expense_deleted', before, null);
    return { deleted: true, id: expenseId };
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
        after: after ? this.toJson(after) : undefined,
        before: before ? this.toJson(before) : undefined,
        entityId,
        entityType: 'expense',
        mandalId,
      },
    });
  }

  private toJson(value: unknown): JsonWriteValue {
    return value as JsonWriteValue;
  }
}
