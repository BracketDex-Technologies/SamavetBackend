import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AuthUser } from './decorators/auth-user.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AuthContext } from './auth-context';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { AppConfig } from '../config/app-config';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: 'Returns access and refresh tokens.' })
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Headers('user-agent') userAgent?: string,
  ) {
    const session = await this.authService.login(dto, {
      ipAddress: request.ip,
      userAgent,
    });
    this.setRefreshCookie(response, session.refreshToken);
    return withoutRefreshToken(session);
  }

  @Post('refresh')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: 'Rotates refresh token and returns a new token pair.' })
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Headers('user-agent') userAgent?: string,
  ) {
    const refreshToken = dto.refreshToken?.trim() || this.readRefreshCookie(request);
    if (!refreshToken) throw new UnauthorizedException('Missing refresh token.');
    const session = await this.authService.refresh(refreshToken, {
      ipAddress: request.ip,
      userAgent,
    });
    this.setRefreshCookie(response, session.refreshToken);
    return withoutRefreshToken(session);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @AuthUser() authUser: AuthContext,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.authService.logout(authUser);
    response.clearCookie(this.config.get('AUTH_COOKIE_NAME', { infer: true }), this.cookieOptions());
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOkResponse({ description: 'Returns the current authenticated user and mandal scope.' })
  me(@AuthUser() authUser: AuthContext) {
    return this.authService.getMe(authUser);
  }

  private readRefreshCookie(request: Request) {
    const cookieName = this.config.get('AUTH_COOKIE_NAME', { infer: true });
    const cookieHeader = request.headers.cookie ?? '';
    for (const segment of cookieHeader.split(';')) {
      const separator = segment.indexOf('=');
      if (separator < 0) continue;
      const name = segment.slice(0, separator).trim();
      if (name === cookieName) return decodeURIComponent(segment.slice(separator + 1).trim());
    }
    return '';
  }

  private setRefreshCookie(response: Response, refreshToken: string) {
    response.cookie(this.config.get('AUTH_COOKIE_NAME', { infer: true }), refreshToken, {
      ...this.cookieOptions(),
      maxAge: this.config.get('AUTH_REFRESH_COOKIE_MAX_AGE_MS', { infer: true }),
    });
  }

  private cookieOptions() {
    return {
      httpOnly: true,
      path: '/api/v1/auth',
      sameSite: this.config.get('AUTH_COOKIE_SAME_SITE', { infer: true }),
      secure: this.config.get('AUTH_COOKIE_SECURE', { infer: true }),
    } as const;
  }
}

function withoutRefreshToken<T extends { refreshToken: string }>(session: T): Omit<T, 'refreshToken'> {
  const { refreshToken: _refreshToken, ...safeSession } = session;
  return safeSession;
}
