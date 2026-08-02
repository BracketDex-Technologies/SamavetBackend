import { ApiPropertyOptional } from '@nestjs/swagger';
import { SlipStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class ListVarganiSlipsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({ enum: SlipStatus })
  @IsEnum(SlipStatus)
  @IsOptional()
  status?: SlipStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  createdByUserId?: string;

  @ApiPropertyOptional({ example: '2026-08-02' })
  @IsDateString({ strict: true })
  @IsOptional()
  date?: string;
}
