import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsPhoneNumber, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateMandalUserDto {
  @ApiProperty({ example: 'Pramod Jadhav' })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ example: 'khajindar@mandal.local' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ example: '+919876543210' })
  @IsPhoneNumber('IN')
  @IsOptional()
  phone?: string;

  @ApiProperty({ enum: UserRole, example: UserRole.KHAJINDAR })
  @IsEnum(UserRole)
  role!: UserRole;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;
}
