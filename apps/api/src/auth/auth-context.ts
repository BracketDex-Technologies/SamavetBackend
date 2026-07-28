import { UserRole } from '@prisma/client';

export interface AuthContext {
  userId: string;
  mandalId: string | null;
  role: UserRole;
  sessionId?: string;
}

export function isPlatformUser(ctx: AuthContext): boolean {
  return ctx.role === UserRole.SUPER_ADMIN && ctx.mandalId === null;
}
