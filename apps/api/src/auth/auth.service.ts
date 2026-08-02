import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AccountStatus, User } from '@prisma/client';
import argon2 from 'argon2';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
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
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async login(dto: LoginDto, metadata: SessionMetadata) {
    const startedAt = Date.now();
    const user = await this.findLoginUser(dto.identifier);

    if (!user || user.status !== AccountStatus.ACTIVE) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const passwordStartedAt = Date.now();
    const passwordMatches = await argon2.verify(user.passwordHash, dto.password);
    const passwordDurationMs = Date.now() - passwordStartedAt;

    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const session = await this.createSessionTokenPair(user, metadata);
    this.recordLoginSideEffects(user.id, session.sessionId).catch((error: unknown) => {
      this.logger.warn(JSON.stringify({
        detail: error instanceof Error ? error.message : 'Unknown login side-effect error',
        scope: 'auth.login.side_effects',
        userId: user.id,
      }));
    });
    const durationMs = Date.now() - startedAt;
    if (durationMs >= 2_000) {
      this.logger.warn(JSON.stringify({
        durationMs,
        passwordDurationMs,
        role: user.role,
        scope: 'auth.login',
        userId: user.id,
      }));
    }
    return this.sessionResponse(session, user);
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

    const tokenMatches = await verifyRefreshTokenHash(session.refreshTokenHash, refreshToken);

    if (!tokenMatches) {
      await this.revokeSession(session.id);
      throw new UnauthorizedException('Invalid refresh token.');
    }

    const nextSession = await this.createSessionTokenPair(session.user, metadata, session.id);
    return this.sessionResponse(nextSession, session.user);
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

    if (!payload.sub || !payload.sessionId) throw new UnauthorizedException('Session is no longer active.');

    if (!this.config.get('AUTH_STRICT_SESSION_CHECK', { infer: true })) {
      return {
        mandalId: payload.mandalId ?? null,
        role: payload.role,
        sessionId: payload.sessionId,
        userId: payload.sub,
      };
    }

    const session = await this.prisma.userSession.findFirst({
      select: {
        expiresAt: true,
        revokedAt: true,
        user: { select: { id: true, mandalId: true, role: true, status: true } },
      },
      where: { id: payload.sessionId, userId: payload.sub },
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
      userId: session.user.id,
    };
  }

  private async createSessionTokenPair(
    user: User,
    metadata: SessionMetadata,
    existingSessionId?: string,
  ) {
    const sessionId = existingSessionId ?? randomUUID();
    const payload: JwtPayload = {
      mandalId: user.mandalId,
      role: user.role,
      sessionId,
      sub: user.id,
    };
    const refreshPayload: RefreshJwtPayload = {
      sessionId,
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

    const decoded = this.jwt.decode(refreshToken) as { exp?: number } | null;
    const refreshExpiresAt = new Date((decoded?.exp ?? Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60) * 1000);
    // Refresh tokens are signed, high-entropy secrets. A fast one-way digest is
    // sufficient here and avoids a second memory-heavy Argon2 operation on every
    // login/refresh. Passwords continue to use Argon2.
    const refreshTokenHash = hashRefreshToken(refreshToken);

    if (existingSessionId) {
      await this.prisma.userSession.update({
        data: {
          expiresAt: refreshExpiresAt,
          ipAddress: metadata.ipAddress,
          refreshTokenHash,
          revokedAt: null,
          userAgent: metadata.userAgent,
        },
        where: { id: existingSessionId },
      });
    } else {
      await this.prisma.userSession.create({
        data: {
          expiresAt: refreshExpiresAt,
          id: sessionId,
          ipAddress: metadata.ipAddress,
          refreshTokenHash,
          userAgent: metadata.userAgent,
          userId: user.id,
        },
      });
    }

    return {
      accessToken,
      refreshToken,
      sessionId,
    };
  }

  private sessionResponse(
    session: { accessToken: string; refreshToken: string; sessionId: string },
    user: User,
  ) {
    return {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      user: {
        id: user.id,
        mandalId: user.mandalId,
        name: user.name,
        role: user.role,
      },
    };
  }

  private async recordLoginSideEffects(userId: string, activeSessionId: string) {
    const loginTime = new Date();
    await this.prisma.user.update({ data: { lastLoginAt: loginTime }, where: { id: userId } });
    await this.prisma.userSession.deleteMany({
      where: {
        expiresAt: { lte: loginTime },
        id: { not: activeSessionId },
        userId,
      },
    });
  }

  private async findLoginUser(identifier: string) {
    const normalized = identifier.trim().toLowerCase();

    // Both fields are unique database indexes. Avoiding an OR query gives the
    // planner one direct index lookup on this high-traffic endpoint.
    return normalized.includes('@')
      ? this.prisma.user.findUnique({ where: { email: normalized } })
      : this.prisma.user.findUnique({ where: { phone: identifier.trim() } });
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

const REFRESH_TOKEN_HASH_PREFIX = 'sha256:';

function hashRefreshToken(refreshToken: string): string {
  return `${REFRESH_TOKEN_HASH_PREFIX}${createHash('sha256').update(refreshToken).digest('hex')}`;
}

async function verifyRefreshTokenHash(storedHash: string, refreshToken: string): Promise<boolean> {
  if (storedHash.startsWith(REFRESH_TOKEN_HASH_PREFIX)) {
    const expected = Buffer.from(storedHash.slice(REFRESH_TOKEN_HASH_PREFIX.length), 'hex');
    const actual = createHash('sha256').update(refreshToken).digest();
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  // Existing sessions were stored with Argon2. They remain valid and are
  // automatically upgraded to SHA-256 when refresh rotates the token.
  try {
    return await argon2.verify(storedHash, refreshToken);
  } catch {
    return false;
  }
}
