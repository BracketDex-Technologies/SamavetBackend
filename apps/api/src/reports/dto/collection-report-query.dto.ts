import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMode } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { DateRangeQueryDto } from '../../common/dto/date-range-query.dto';

export class CollectionReportQueryDto extends DateRangeQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  memberId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  groupId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  areaName?: string;

  @ApiPropertyOptional({ enum: PaymentMode })
  @IsEnum(PaymentMode)
  @IsOptional()
  paymentMode?: PaymentMode;
}
