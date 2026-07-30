import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class UploadSlipReceiptImageDto {
  @ApiProperty({ example: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ...' })
  @IsString()
  @MaxLength(15_000_000)
  dataUrl!: string;
}
