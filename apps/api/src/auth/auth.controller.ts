import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthUser } from './decorators/auth-user.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AuthContext } from './auth-context';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: 'Returns access and refresh tokens.' })
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.authService.login(dto, {
      ipAddress: request.ip,
      userAgent,
    });
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: 'Rotates refresh token and returns a new token pair.' })
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() request: Request,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.authService.refresh(dto.refreshToken, {
      ipAddress: request.ip,
      userAgent,
    });
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@AuthUser() authUser: AuthContext) {
    await this.authService.logout(authUser);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOkResponse({ description: 'Returns the current authenticated user and mandal scope.' })
  me(@AuthUser() authUser: AuthContext) {
    return this.authService.getMe(authUser);
  }
}
