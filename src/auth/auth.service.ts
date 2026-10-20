import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { ExecuteService } from 'src/execute/execute.service';
import { LoginDto } from './dto/LoginDto';
import { CreateUserDto } from 'src/user/dto/create-user.dto';

const KNOWN_ROLES = new Set(['admin', 'student', 'teacher']);

@Injectable()
export class AuthService {
  constructor(
    private readonly executeService: ExecuteService,
    private readonly config: ConfigService,
  ) {}

  async login(dto: LoginDto) {
    const result = await this.executeService.execute('auth', 'auth', dto as any);
    const user = result?.user ?? result;
    if (!user || typeof user.user_id !== 'number')
      throw new UnauthorizedException('Correo o contraseña incorrectos');

    const roles = this.readRoles(user);
    if (!roles.length) throw new UnauthorizedException('La cuenta no tiene un rol válido');
    const secret = this.config.get<string>('JWT_SECRET');
    if (!secret || secret.length < 32) {
      throw new UnauthorizedException('Autenticación no configurada en el servidor');
    }

    const now = Math.floor(Date.now() / 1000);
    const header = this.encode({ alg: 'HS256', typ: 'JWT' });
    const payload = this.encode({
      user_id: user.user_id,
      email: typeof user.email === 'string' ? user.email : '',
      roles,
      iat: now,
      exp: now + 15 * 60,
    });
    const unsigned = `${header}.${payload}`;
    const access_token = `${unsigned}.${createHmac('sha256', secret).update(unsigned).digest('base64url')}`;

    return {
      access_token,
      expires_in: 900,
      user: {
        user_id: user.user_id,
        name: user.name,
        last_name: user.last_name,
        email: user.email,
        phone: user.phone,
        document_type: user.document_type,
        document_number: user.document_number,
        roles,
      },
    };
  }

  async registerStudent(dto: CreateUserDto) {
    if (
      !dto.name?.trim() ||
      !dto.last_name?.trim() ||
      !dto.email?.trim() ||
      !dto.password ||
      dto.password.length < 8
    ) {
      throw new BadRequestException('Completa tus datos y usa una contraseña de al menos 8 caracteres');
    }
    const created = await this.executeService.execute('users', 'i', {
      name: dto.name,
      last_name: dto.last_name,
      email: dto.email,
      password: dto.password,
      phone: dto.phone,
      document_type: dto.document_type,
      document_number: dto.document_number,
      role: 'student',
    });
    if (!created) throw new UnauthorizedException('No se pudo crear la cuenta');
    return this.login({ email: dto.email, password: dto.password } as LoginDto);
  }

  private readRoles(user: Record<string, any>): string[] {
    const source = Array.isArray(user.roles) ? user.roles : [user.role];
    return [...new Set(source.map((role: any) =>
      typeof role === 'string' ? role.toLowerCase() : role?.name?.toLowerCase(),
    ).filter((role: unknown): role is string => typeof role === 'string' && KNOWN_ROLES.has(role)))];
  }

  private encode(value: object) {
    return Buffer.from(JSON.stringify(value)).toString('base64url');
  }
}
