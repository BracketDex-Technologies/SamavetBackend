import { ApiPropertyOptional } from '@nestjs/swagger';
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

export class UpdateCustomFieldDto {
  @ApiPropertyOptional({ example: 'Donor Type' })
  @IsString()
  @IsOptional()
  @MaxLength(120)
  label?: string;

  @ApiPropertyOptional({ enum: CustomFieldType, example: CustomFieldType.TEXT })
  @IsEnum(CustomFieldType)
  @IsOptional()
  type?: CustomFieldType;

  @ApiPropertyOptional({ example: false })
  @IsBoolean()
  @IsOptional()
  required?: boolean;

  @ApiPropertyOptional({ example: ['Family', 'Shop', 'Sponsor'] })
  @IsArray()
  @IsOptional()
  options?: string[];

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  printOnSlip?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsBoolean()
  @IsOptional()
  dashboardFilter?: boolean;

  @ApiPropertyOptional({ example: 10 })
  @IsInt()
  @IsOptional()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ description: 'Optional UI metadata for future builder controls.' })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}
