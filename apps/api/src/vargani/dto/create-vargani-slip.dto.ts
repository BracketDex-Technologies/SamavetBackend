import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMode, SlipStatus } from '@prisma/client';
import { IsEnum, IsObject, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateVarganiSlipDto {
  @ApiProperty({ example: 'Mahesh Traders' })
  @IsString()
  @MaxLength(180)
  contributorName!: string;

  @ApiPropertyOptional({ example: '+919876543210' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  contributorPhone?: string;

  @ApiPropertyOptional({ example: 'Laxmi Road, Pune' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  contributorAddress?: string;

  @ApiPropertyOptional({ example: 'Mahesh Traders' })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  shopName?: string;

  @ApiProperty({ example: 5100 })
  @Min(1)
  amount!: number;

  @ApiProperty({ enum: PaymentMode })
  @IsEnum(PaymentMode)
  paymentMode!: PaymentMode;

  @ApiPropertyOptional({ enum: SlipStatus, example: SlipStatus.ACTIVE })
  @IsEnum(SlipStatus)
  @IsOptional()
  status?: SlipStatus;

  @ApiPropertyOptional({ example: 'Laxmi Road' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  areaName?: string;

  @ApiPropertyOptional()
  @IsObject()
  @IsOptional()
  customData?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  idempotencyKey?: string;
}
