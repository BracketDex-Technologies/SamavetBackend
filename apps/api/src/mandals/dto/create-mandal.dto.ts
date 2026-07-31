import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDefined,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsPhoneNumber,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateMandalAdminDto {
  @ApiProperty({ example: 'Amit Patil' })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ example: '+919876543210' })
  @IsOptional()
  @IsPhoneNumber('IN')
  phone?: string;

  @ApiProperty({ example: 'admin@mandal.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 12 })
  @IsString()
  @MinLength(12)
  password!: string;
}

export class CreateMandalDto {
  @ApiProperty({ example: 'Shree Ganesh Mitra Mandal' })
  @IsString()
  @MaxLength(160)
  name!: string;

  @ApiPropertyOptional({ example: 'बाजीराव रोड नतुबग मंडळ ट्रस्ट' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  nameMr?: string;

  @ApiPropertyOptional({ example: 'shree-ganesh-mitra-mandal' })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @MaxLength(80)
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiPropertyOptional({ example: 'Dadar West' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  locality?: string;

  @ApiPropertyOptional({ example: 'Mumbai' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @ApiPropertyOptional({ example: 'Maharashtra' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  state?: string;

  @ApiPropertyOptional({ example: 'Starter' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  plan?: string;

  @ApiPropertyOptional({ description: 'Maximum number of slips this Mandal can generate.', example: 1000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  slipLimit?: number;

  @ApiPropertyOptional({ enum: ['AUTO_API', 'MANUAL_SHARE'], example: 'AUTO_API' })
  @IsOptional()
  @IsIn(['AUTO_API', 'MANUAL_SHARE'])
  whatsappMode?: 'AUTO_API' | 'MANUAL_SHARE';

  @ApiPropertyOptional({ example: 'Rahul Shinde' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  contactName?: string;

  @ApiPropertyOptional({ example: '+919876543211' })
  @IsOptional()
  @IsPhoneNumber('IN')
  contactPhone?: string;

  @ApiPropertyOptional({ description: 'Mandal logo as an image data URL or public URL.' })
  @IsOptional()
  @IsString()
  logoDataUrl?: string;

  @ApiPropertyOptional({ example: 'https://example.com/templates/default-vargani-receipt.svg' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(1000)
  defaultTemplateUrl?: string;

  @ApiProperty()
  @IsDefined()
  @ValidateNested()
  @Type(() => CreateMandalAdminDto)
  admin!: CreateMandalAdminDto;
}
