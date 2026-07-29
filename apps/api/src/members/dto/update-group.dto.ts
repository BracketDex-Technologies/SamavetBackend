import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class UpdateGroupDto {
  @ApiPropertyOptional({ example: 'Main Road Team' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ example: 'Lane no 1' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  areaName?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  leaderUserId?: string | null;
}
