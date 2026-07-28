import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuthContext } from '../auth/auth-context';
import { AuthUser } from '../auth/decorators/auth-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateExpenseCategoryDto } from './dto/create-expense-category.dto';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { UpdateExpenseStatusDto } from './dto/update-expense-status.dto';
import { ExpensesService } from './expenses.service';

@ApiTags('expenses')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('mandals/:mandalId/festivals/:festivalId/expenses')
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Post('categories')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MANDAL_ADMIN, UserRole.KHAJINDAR)
  createCategory(
    @AuthUser() ctx: AuthContext,
    @Param('mandalId') mandalId: string,
    @Body() dto: CreateExpenseCategoryDto,
  ) {
    return this.expensesService.createCategory(ctx, mandalId, dto);
  }

  @Get('categories')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MANDAL_ADMIN, UserRole.KHAJINDAR)
  listCategories(@AuthUser() ctx: AuthContext, @Param('mandalId') mandalId: string) {
    return this.expensesService.listCategories(ctx, mandalId);
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.MANDAL_ADMIN, UserRole.KHAJINDAR)
  createExpense(
    @AuthUser() ctx: AuthContext,
    @Param('mandalId') mandalId: string,
    @Param('festivalId') festivalId: string,
    @Body() dto: CreateExpenseDto,
  ) {
    return this.expensesService.createExpense(ctx, mandalId, festivalId, dto);
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.MANDAL_ADMIN, UserRole.KHAJINDAR)
  listExpenses(
    @AuthUser() ctx: AuthContext,
    @Param('mandalId') mandalId: string,
    @Param('festivalId') festivalId: string,
  ) {
    return this.expensesService.listExpenses(ctx, mandalId, festivalId);
  }

  @Patch(':expenseId')
  @Roles(UserRole.MANDAL_ADMIN, UserRole.KHAJINDAR)
  updateExpense(
    @AuthUser() ctx: AuthContext,
    @Param('mandalId') mandalId: string,
    @Param('festivalId') festivalId: string,
    @Param('expenseId') expenseId: string,
    @Body() dto: UpdateExpenseDto,
  ) {
    return this.expensesService.updateExpense(ctx, mandalId, festivalId, expenseId, dto);
  }

  @Patch(':expenseId/status')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MANDAL_ADMIN, UserRole.KHAJINDAR)
  updateStatus(
    @AuthUser() ctx: AuthContext,
    @Param('mandalId') mandalId: string,
    @Param('expenseId') expenseId: string,
    @Body() dto: UpdateExpenseStatusDto,
  ) {
    return this.expensesService.updateStatus(ctx, mandalId, expenseId, dto);
  }

  @Delete(':expenseId')
  @Roles(UserRole.MANDAL_ADMIN, UserRole.KHAJINDAR)
  deleteExpense(
    @AuthUser() ctx: AuthContext,
    @Param('mandalId') mandalId: string,
    @Param('festivalId') festivalId: string,
    @Param('expenseId') expenseId: string,
  ) {
    return this.expensesService.deleteExpense(ctx, mandalId, festivalId, expenseId);
  }
}
