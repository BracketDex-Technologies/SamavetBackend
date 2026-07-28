import { ApiPropertyOptional } from '@nestjs/swagger';
import { AccountStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class ListMandalsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({ enum: AccountStatus })
  @IsEnum(AccountStatus)
  @IsOptional()
  status?: AccountStatus;
}
