import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AUTH_CONTEXT_KEY } from '../auth.constants';
import { AuthService } from '../auth.service';
import { RequestWithAuth } from '../../common/http/request-with-auth';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithAuth>();
    const token = this.extractBearerToken(request.headers.authorization);

    if (!token) {
      throw new UnauthorizedException('Missing bearer token.');
    }

    request[AUTH_CONTEXT_KEY] = await this.authService.verifyAccessToken(token);
    return true;
  }

  private extractBearerToken(authorization?: string): string | null {
    if (!authorization) {
      return null;
    }

    const [type, token] = authorization.split(' ');
    return type?.toLowerCase() === 'bearer' && token ? token : null;
  }
}
