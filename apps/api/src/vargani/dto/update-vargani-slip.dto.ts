import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMode, SlipStatus } from '@prisma/client';
import {
  IsEnum,
  IsObject,
  IsOptional,
  IsPhoneNumber,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateVarganiSlipDto {
  @ApiPropertyOptional({ example: 'Mahesh Traders' })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  contributorName?: string;

  @ApiPropertyOptional({ example: '+919876543210' })
  @IsOptional()
  @IsPhoneNumber('IN')
  contributorPhone?: string;

  @ApiPropertyOptional({ example: 'Prathama Building, Ramtekdi' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  contributorAddress?: string;

  @ApiPropertyOptional({ example: 'Mahesh Traders' })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  shopName?: string;

  @ApiPropertyOptional({ example: 5100 })
  @IsOptional()
  @Min(1)
  amount?: number;

  @ApiPropertyOptional({ enum: PaymentMode })
  @IsOptional()
  @IsEnum(PaymentMode)
  paymentMode?: PaymentMode;

  @ApiPropertyOptional({ enum: SlipStatus })
  @IsOptional()
  @IsEnum(SlipStatus)
  status?: SlipStatus;

  @ApiPropertyOptional({ example: 'Ramtekdi' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  areaName?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  customData?: Record<string, unknown>;
}
