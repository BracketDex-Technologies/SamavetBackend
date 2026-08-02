import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsPhoneNumber, IsString, Matches, MaxLength, Min } from 'class-validator';

export class UpdateMandalDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  nameMr?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  locality?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  state?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  contactName?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsPhoneNumber('IN')
  contactPhone?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  plan?: string;

  @ApiPropertyOptional({ description: 'Maximum number of slips this Mandal can generate.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  slipLimit?: number | null;

  @ApiPropertyOptional({ enum: ['AUTO_API', 'MANUAL_SHARE'] })
  @IsOptional()
  @IsIn(['AUTO_API', 'MANUAL_SHARE'])
  whatsappMode?: 'AUTO_API' | 'MANUAL_SHARE';

  @ApiPropertyOptional({
    description: 'Approved Authkey WhatsApp template WID. Send null to use the global fallback template.',
    example: '43015',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d+$/)
  @MaxLength(32)
  whatsappTemplateWid?: string | null;

  @ApiPropertyOptional({ description: 'Replacement Mandal logo as an image data URL.' })
  @IsOptional()
  @IsString()
  logoDataUrl?: string;
}
