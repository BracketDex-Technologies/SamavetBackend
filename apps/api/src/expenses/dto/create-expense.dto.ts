import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ExpenseStatus } from '@prisma/client';
import { IsEnum, IsISO8601, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class CreateExpenseDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiProperty({ example: 42000 })
  @Min(1)
  amount!: number;

  @ApiPropertyOptional({ example: 'Shree Decorators' })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  vendorName?: string;

  @ApiProperty({ example: '2026-08-26' })
  @IsISO8601()
  expenseDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  billFileUrl?: string;

  @ApiPropertyOptional({ enum: ExpenseStatus })
  @IsEnum(ExpenseStatus)
  @IsOptional()
  status?: ExpenseStatus;
}
