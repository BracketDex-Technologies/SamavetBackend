import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AccountStatus, User } from '@prisma/client';
import argon2 from 'argon2';
import { AppConfig } from '../config/app-config';
import { PrismaService } from '../prisma/prisma.service';
import { AuthContext } from './auth-context';
import { LoginDto } from './dto/login.dto';
import { JwtPayload, RefreshJwtPayload } from './jwt-payload';

interface SessionMetadata {
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async login(dto: LoginDto, metadata: SessionMetadata) {
    const user = await this.findLoginUser(dto.identifier);

    if (!user || user.status !== AccountStatus.ACTIVE) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const passwordMatches = await argon2.verify(user.passwordHash, dto.password);

    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    await this.prisma.user.update({
      data: { lastLoginAt: new Date() },
      where: { id: user.id },
    });

    return this.createSessionTokenPair(user, metadata);
  }

  async refresh(refreshToken: string, metadata: SessionMetadata) {
    const payload = await this.verifyRefreshToken(refreshToken);
    const session = await this.prisma.userSession.findUnique({
      include: { user: true },
      where: { id: payload.sessionId },
    });

    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      session.user.status !== AccountStatus.ACTIVE
    ) {
      throw new UnauthorizedException('Invalid refresh token.');
    }

    const tokenMatches = await argon2.verify(session.refreshTokenHash, refreshToken);

    if (!tokenMatches) {
      await this.revokeSession(session.id);
      throw new UnauthorizedException('Invalid refresh token.');
    }

    await this.revokeSession(session.id);
    return this.createSessionTokenPair(session.user, metadata);
  }

  async logout(ctx: AuthContext): Promise<void> {
    if (ctx.sessionId) {
      await this.revokeSession(ctx.sessionId);
    }
  }

  async getMe(ctx: AuthContext) {
    const user = await this.prisma.user.findUnique({
      select: {
        createdAt: true,
        email: true,
        id: true,
        lastLoginAt: true,
        mandal: {
          select: {
            city: true,
            id: true,
            locality: true,
            logoUrl: true,
            name: true,
            slug: true,
            status: true,
          },
        },
        mandalId: true,
        name: true,
        phone: true,
        role: true,
        status: true,
      },
      where: { id: ctx.userId },
    });

    if (!user || user.status !== AccountStatus.ACTIVE) {
      throw new UnauthorizedException('Session is no longer active.');
    }

    return { user };
  }

  async verifyAccessToken(token: string): Promise<AuthContext> {
    let payload: JwtPayload;

    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token, {
        secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
      });
    } catch {
      throw new UnauthorizedException('Invalid access token.');
    }

    const session = await this.prisma.userSession.findFirst({
      select: {
        expiresAt: true,
        revokedAt: true,
        user: {
          select: {
            mandalId: true,
            role: true,
            status: true,
          },
        },
      },
      where: {
        id: payload.sessionId,
        userId: payload.sub,
      },
    });

    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      session.user.status !== AccountStatus.ACTIVE
    ) {
      throw new UnauthorizedException('Session is no longer active.');
    }

    return {
      mandalId: session.user.mandalId,
      role: session.user.role,
      sessionId: payload.sessionId,
      userId: payload.sub,
    };
  }

  private async createSessionTokenPair(user: User, metadata: SessionMetadata) {
    const refreshExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const session = await this.prisma.userSession.create({
      data: {
        expiresAt: refreshExpiresAt,
        ipAddress: metadata.ipAddress,
        refreshTokenHash: 'pending',
        userAgent: metadata.userAgent,
        userId: user.id,
      },
    });

    const payload: JwtPayload = {
      mandalId: user.mandalId,
      role: user.role,
      sessionId: session.id,
      sub: user.id,
    };
    const refreshPayload: RefreshJwtPayload = {
      sessionId: session.id,
      sub: user.id,
      type: 'refresh',
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, {
        expiresIn: this.config.get('JWT_ACCESS_TTL', { infer: true }),
        secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
      }),
      this.jwt.signAsync(refreshPayload, {
        expiresIn: this.config.get('JWT_REFRESH_TTL', { infer: true }),
        secret: this.config.get('JWT_REFRESH_SECRET', { infer: true }),
      }),
    ]);

    await this.prisma.userSession.update({
      data: {
        refreshTokenHash: await argon2.hash(refreshToken),
      },
      where: { id: session.id },
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        mandalId: user.mandalId,
        name: user.name,
        role: user.role,
      },
    };
  }

  private async findLoginUser(identifier: string) {
    const normalized = identifier.trim().toLowerCase();

    return this.prisma.user.findFirst({
      where: {
        OR: [{ email: normalized }, { phone: identifier.trim() }],
      },
    });
  }

  private async revokeSession(sessionId: string): Promise<void> {
    await this.prisma.userSession.updateMany({
      data: { revokedAt: new Date() },
      where: {
        id: sessionId,
        revokedAt: null,
      },
    });
  }

  private async verifyRefreshToken(refreshToken: string) {
    const payload = await this.jwt.verifyAsync<RefreshJwtPayload>(refreshToken, {
      secret: this.config.get('JWT_REFRESH_SECRET', { infer: true }),
    });

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid refresh token.');
    }

    return payload;
  }
}
