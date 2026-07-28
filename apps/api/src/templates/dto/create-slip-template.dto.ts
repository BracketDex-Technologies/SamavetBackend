import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class CreateSlipTemplateDto {
  @ApiProperty({ example: 'Ganpati 2026 Receipt' })
  @IsString()
  @MaxLength(140)
  name!: string;
}
