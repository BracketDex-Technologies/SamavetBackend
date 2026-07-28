import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsObject, IsString, Max, Min } from 'class-validator';

export class CreateTemplateVersionDto {
  @ApiProperty({ example: 'https://cdn.example.com/templates/ganpati-slip.png' })
  @IsString()
  backgroundFileUrl!: string;

  @ApiProperty({ example: 1240 })
  @IsInt()
  @Min(320)
  @Max(6000)
  @Type(() => Number)
  canvasWidth!: number;

  @ApiProperty({ example: 1754 })
  @IsInt()
  @Min(320)
  @Max(6000)
  @Type(() => Number)
  canvasHeight!: number;

  @ApiProperty({
    example: {
      fields: {
        amount: { x: 820, y: 410, fontSize: 34 },
        contributorName: { x: 230, y: 400, fontSize: 30 },
      },
    },
  })
  @IsObject()
  renderConfig!: Record<string, unknown>;
}
