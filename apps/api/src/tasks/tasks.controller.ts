import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuthContext } from '../auth/auth-context';
import { AuthUser } from '../auth/decorators/auth-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TasksService } from './tasks.service';

@ApiTags('tasks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('mandals/:mandalId/festivals/:festivalId/tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @Roles(UserRole.MANDAL_ADMIN, UserRole.KHAJINDAR, UserRole.GROUP_LEADER)
  @ApiCreatedResponse({ description: 'Task created.' })
  createTask(
    @AuthUser() ctx: AuthContext,
    @Param('mandalId') mandalId: string,
    @Param('festivalId') festivalId: string,
    @Body() dto: CreateTaskDto,
  ) {
    return this.tasksService.createTask(ctx, mandalId, festivalId, dto);
  }

  @Get()
  @Roles(UserRole.MANDAL_ADMIN, UserRole.KHAJINDAR, UserRole.GROUP_LEADER)
  @ApiOkResponse({ description: 'Festival task list.' })
  listTasks(
    @AuthUser() ctx: AuthContext,
    @Param('mandalId') mandalId: string,
    @Param('festivalId') festivalId: string,
  ) {
    return this.tasksService.listTasks(ctx, mandalId, festivalId);
  }

  @Patch(':taskId')
  @Roles(UserRole.MANDAL_ADMIN, UserRole.KHAJINDAR, UserRole.GROUP_LEADER)
  @ApiOkResponse({ description: 'Task updated.' })
  updateTask(
    @AuthUser() ctx: AuthContext,
    @Param('mandalId') mandalId: string,
    @Param('festivalId') festivalId: string,
    @Param('taskId') taskId: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasksService.updateTask(ctx, mandalId, festivalId, taskId, dto);
  }

  @Delete(':taskId')
  @Roles(UserRole.MANDAL_ADMIN, UserRole.KHAJINDAR)
  @ApiOkResponse({ description: 'Task deleted.' })
  deleteTask(
    @AuthUser() ctx: AuthContext,
    @Param('mandalId') mandalId: string,
    @Param('festivalId') festivalId: string,
    @Param('taskId') taskId: string,
  ) {
    return this.tasksService.deleteTask(ctx, mandalId, festivalId, taskId);
  }
}
