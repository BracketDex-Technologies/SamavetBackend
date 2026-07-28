import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { CreateTemplateVersionDto } from './create-template-version.dto';

export class SaveTemplateConfigDto extends CreateTemplateVersionDto {
  @ApiPropertyOptional({ example: 'Ganpati 2026 Vargani Receipt' })
  @IsOptional()
  @IsString()
  @MaxLength(140)
  name?: string;
}
