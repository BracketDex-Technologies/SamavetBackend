import { ApiProperty } from '@nestjs/swagger';
import { FestivalStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateFestivalStatusDto {
  @ApiProperty({ enum: FestivalStatus })
  @IsEnum(FestivalStatus)
  status!: FestivalStatus;
}
