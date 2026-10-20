import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { IS_PUBLIC_KEY, ROLES_KEY } from './auth.decorators';

interface SessionUser {
  user_id: number;
  email: string;
  roles: string[];
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const header = request.headers.authorization;
    const token = typeof header === 'string' && header.startsWith('Bearer ')
      ? header.slice(7)
      : '';
    const user = this.verify(token);
    request.user = user;

    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (requiredRoles?.length && !requiredRoles.some((role) => user.roles.includes(role))) {
      throw new ForbiddenException('No tienes permisos para esta operación');
    }
    return true;
  }

  private verify(token: string): SessionUser {
    const secret = this.config.get<string>('JWT_SECRET');
    if (!secret || secret.length < 32) {
      throw new UnauthorizedException('Autenticación no configurada en el servidor');
    }

    const parts = token.split('.');
    if (parts.length !== 3) throw new UnauthorizedException('Sesión inválida o vencida');
    const [header, payload, signature] = parts;
    try {
      const tokenHeader = JSON.parse(Buffer.from(header, 'base64url').toString());
      if (tokenHeader.alg !== 'HS256' || tokenHeader.typ !== 'JWT') {
        throw new Error('invalid header');
      }
    } catch {
      throw new UnauthorizedException('Sesión inválida o vencida');
    }
    const expected = createHmac('sha256', secret)
      .update(`${header}.${payload}`)
      .digest('base64url');
    const expectedBuffer = Buffer.from(expected);
    const actualBuffer = Buffer.from(signature);
    if (
      expectedBuffer.length !== actualBuffer.length ||
      !timingSafeEqual(expectedBuffer, actualBuffer)
    ) {
      throw new UnauthorizedException('Sesión inválida o vencida');
    }

    try {
      const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
      if (
        !Number.isInteger(claims.user_id) ||
        !Array.isArray(claims.roles) ||
        !Number.isInteger(claims.exp) ||
        claims.exp <= Math.floor(Date.now() / 1000)
      ) {
        throw new Error('invalid claims');
      }
      return {
        user_id: claims.user_id,
        email: typeof claims.email === 'string' ? claims.email : '',
        roles: claims.roles.filter((role: unknown) => typeof role === 'string'),
      };
    } catch {
      throw new UnauthorizedException('Sesión inválida o vencida');
    }
  }
}
