import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthContext } from './auth-context';

export function assertSameMandal(ctx: AuthContext, mandalId: string): void {
  if (ctx.role === UserRole.SUPER_ADMIN) {
    return;
  }

  if (!ctx.mandalId || ctx.mandalId !== mandalId) {
    throw new ForbiddenException('You do not have access to this mandal.');
  }
}

export function requireMandalId(ctx: AuthContext): string {
  if (!ctx.mandalId) {
    throw new ForbiddenException('This action requires a mandal-scoped user.');
  }

  return ctx.mandalId;
}
