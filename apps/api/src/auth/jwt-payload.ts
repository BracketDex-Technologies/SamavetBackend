import { UserRole } from '@prisma/client';

export interface JwtPayload {
  sub: string;
  mandalId: string | null;
  role: UserRole;
  sessionId: string;
}

export interface RefreshJwtPayload {
  sub: string;
  sessionId: string;
  type: 'refresh';
}
