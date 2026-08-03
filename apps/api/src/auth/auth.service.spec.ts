import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AccountStatus, UserRole } from '@prisma/client';
import { AppConfig } from '../config/app-config';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

function createService(session: unknown, strict = true) {
  const config = {
    get: jest.fn((key: keyof AppConfig) =>
      key === 'AUTH_STRICT_SESSION_CHECK' ? strict : 'access-secret-that-is-longer-than-thirty-two-characters',
    ),
  } as unknown as ConfigService<AppConfig, true>;
  const jwt = {
    verifyAsync: jest.fn().mockResolvedValue({
      mandalId: 'stale-mandal',
      role: UserRole.MEMBER,
      sessionId: 'session-1',
      sub: 'user-1',
    }),
  } as unknown as JwtService;
  const prisma = {
    userSession: { findFirst: jest.fn().mockResolvedValue(session) },
  } as unknown as PrismaService;
  return { prisma, service: new AuthService(config, jwt, prisma) };
}

describe('AuthService access-session verification', () => {
  it('uses current database authorization rather than stale JWT claims', async () => {
    const { prisma, service } = createService({
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      user: {
        id: 'user-1',
        mandalId: 'current-mandal',
        role: UserRole.MANDAL_ADMIN,
        status: AccountStatus.ACTIVE,
      },
    });

    await expect(service.verifyAccessToken('signed-token')).resolves.toEqual({
      mandalId: 'current-mandal',
      role: UserRole.MANDAL_ADMIN,
      sessionId: 'session-1',
      userId: 'user-1',
    });
    await expect(service.verifyAccessToken('signed-token')).resolves.toEqual({
      mandalId: 'current-mandal',
      role: UserRole.MANDAL_ADMIN,
      sessionId: 'session-1',
      userId: 'user-1',
    });
    expect(prisma.userSession.findFirst).toHaveBeenCalledTimes(1);
  });

  it.each([
    null,
    {
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: new Date(),
      user: { id: 'user-1', mandalId: null, role: UserRole.MEMBER, status: AccountStatus.ACTIVE },
    },
    {
      expiresAt: new Date(Date.now() - 60_000),
      revokedAt: null,
      user: { id: 'user-1', mandalId: null, role: UserRole.MEMBER, status: AccountStatus.ACTIVE },
    },
  ])('rejects missing, revoked, or expired server sessions', async (session) => {
    const { service } = createService(session);
    await expect(service.verifyAccessToken('signed-token')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
