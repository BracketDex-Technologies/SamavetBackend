import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AUTH_CONTEXT_KEY } from '../auth.constants';
import { AuthContext } from '../auth-context';

export const AuthUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthContext => {
    const request = ctx.switchToHttp().getRequest();
    return request[AUTH_CONTEXT_KEY] as AuthContext;
  },
);
