import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class RefreshTokenDto {
  @ApiPropertyOptional({ description: 'Legacy body token. Browsers use the HttpOnly refresh cookie.' })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
