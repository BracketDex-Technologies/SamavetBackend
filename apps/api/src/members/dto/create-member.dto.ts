import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsPhoneNumber,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateMemberDto {
  @ApiProperty({ example: 'Sagar Jadhav' })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ example: '+919876543210' })
  @IsOptional()
  @IsPhoneNumber('IN')
  phone?: string;

  @ApiPropertyOptional({ example: 'sagar@example.com' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ enum: UserRole, example: UserRole.MEMBER })
  @IsEnum(UserRole)
  role!: UserRole;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  groupId?: string;

  @ApiPropertyOptional({ example: 'Laxmi Road' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  areaName?: string;
}
