import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CancelSlipDto {
  @ApiProperty()
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason!: string;
}
