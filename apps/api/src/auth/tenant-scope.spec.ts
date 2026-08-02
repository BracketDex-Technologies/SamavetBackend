import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { assertSameMandal, requireMandalId } from './tenant-scope';

describe('tenant scope', () => {
  const member = {
    mandalId: 'mandal-a',
    role: UserRole.MEMBER,
    sessionId: 'session',
    userId: 'user',
  };

  it('allows a mandal user to access only their own mandal', () => {
    expect(() => assertSameMandal(member, 'mandal-a')).not.toThrow();
    expect(() => assertSameMandal(member, 'mandal-b')).toThrow(ForbiddenException);
  });

  it('allows the platform owner to manage any mandal', () => {
    expect(() => assertSameMandal({ ...member, mandalId: null, role: UserRole.SUPER_ADMIN }, 'mandal-b')).not.toThrow();
  });

  it('rejects unscoped users from mandal-only operations', () => {
    expect(() => requireMandalId({ ...member, mandalId: null })).toThrow(ForbiddenException);
  });
});
