import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CustomFieldType } from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateCustomFieldDto {
  @ApiPropertyOptional({ example: 'donor_gstin' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  key?: string;

  @ApiProperty({ example: 'Donor GSTIN' })
  @IsString()
  @MaxLength(120)
  label!: string;

  @ApiProperty({ enum: CustomFieldType, example: CustomFieldType.TEXT })
  @IsEnum(CustomFieldType)
  type!: CustomFieldType;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  required = false;

  @ApiPropertyOptional({ example: ['Cash', 'UPI', 'Cheque'] })
  @IsArray()
  @IsOptional()
  options?: string[];

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  printOnSlip = true;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  dashboardFilter = false;

  @ApiPropertyOptional({ default: 0 })
  @IsInt()
  @IsOptional()
  @Min(0)
  sortOrder = 0;

  @ApiPropertyOptional({ description: 'Optional UI metadata for future builder controls.' })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}
