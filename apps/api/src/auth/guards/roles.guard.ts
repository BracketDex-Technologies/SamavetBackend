import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { AUTH_CONTEXT_KEY, ROLES_METADATA_KEY } from '../auth.constants';
import { AuthContext } from '../auth-context';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_METADATA_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const authContext = request[AUTH_CONTEXT_KEY] as AuthContext | undefined;

    if (!authContext) {
      return false;
    }

    return requiredRoles.includes(authContext.role);
  }
}
