import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateFestivalDto {
  @ApiProperty({ example: 'Ganpati 2026' })
  @IsString()
  @MaxLength(140)
  name!: string;

  @ApiProperty({ example: 'GANPATI' })
  @IsString()
  @MaxLength(80)
  type!: string;

  @ApiProperty({ example: '2026-08-26' })
  @IsISO8601()
  startDate!: string;

  @ApiProperty({ example: '2026-09-06' })
  @IsISO8601()
  endDate!: string;

  @ApiPropertyOptional({ example: 1500000 })
  @IsOptional()
  @Min(0)
  targetAmount?: number;
}
