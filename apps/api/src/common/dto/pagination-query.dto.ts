import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class PaginationQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsInt()
  @IsOptional()
  @Min(1)
  @Type(() => Number)
  page = 1;

  @ApiPropertyOptional({ default: 20, maximum: 100, minimum: 1 })
  @IsInt()
  @IsOptional()
  @Max(100)
  @Min(1)
  @Type(() => Number)
  limit = 20;
}
