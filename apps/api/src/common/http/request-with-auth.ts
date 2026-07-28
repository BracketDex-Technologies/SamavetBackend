import { Request } from 'express';
import { AuthContext } from '../../auth/auth-context';
import { AUTH_CONTEXT_KEY } from '../../auth/auth.constants';

export type RequestWithAuth = Request & {
  [AUTH_CONTEXT_KEY]?: AuthContext;
};
