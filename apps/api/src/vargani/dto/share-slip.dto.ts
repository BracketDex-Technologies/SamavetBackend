import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ShareSlipDto {
  @ApiPropertyOptional({ example: 'WHATSAPP' })
  @IsOptional()
  @IsString()
  @MaxLength(24)
  channel?: string;

  @ApiPropertyOptional({ example: '919284729592' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({ example: 'https://digital-vargani-api.vercel.app/api/v1/public/vargani/slips/id/receipt.html' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  receiptUrl?: string;
}
