import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateGroupDto {
  @ApiProperty({ example: 'Market Area' })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ example: 'Laxmi Road' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  areaName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  leaderUserId?: string;
}
