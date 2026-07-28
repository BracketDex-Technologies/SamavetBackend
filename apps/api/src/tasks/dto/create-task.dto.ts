import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TaskPriority, TaskStatus } from '@prisma/client';
import { IsEnum, IsISO8601, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateTaskDto {
  @ApiProperty({ example: 'Book stage decoration vendor' })
  @IsString()
  @MaxLength(180)
  title!: string;

  @ApiPropertyOptional({ example: 'Confirm quote and advance receipt.' })
  @IsOptional()
  @IsString()
  @MaxLength(1200)
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  assigneeUserId?: string;

  @ApiPropertyOptional({ example: '2026-08-18' })
  @IsOptional()
  @IsISO8601()
  dueDate?: string;

  @ApiPropertyOptional({ enum: TaskStatus })
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @ApiPropertyOptional({ enum: TaskPriority })
  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;
}
