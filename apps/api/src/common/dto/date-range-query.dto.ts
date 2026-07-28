import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional } from 'class-validator';

export class DateRangeQueryDto {
  @ApiPropertyOptional({ example: '2026-07-01' })
  @IsISO8601()
  @IsOptional()
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2026-09-30' })
  @IsISO8601()
  @IsOptional()
  dateTo?: string;
}
