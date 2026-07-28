import { ApiProperty } from '@nestjs/swagger';
import { AccountStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateMandalStatusDto {
  @ApiProperty({ enum: AccountStatus })
  @IsEnum(AccountStatus)
  status!: AccountStatus;
}
