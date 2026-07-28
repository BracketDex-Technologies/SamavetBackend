import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class CreateExpenseCategoryDto {
  @ApiProperty({ example: 'Decoration' })
  @IsString()
  @MaxLength(120)
  name!: string;
}
