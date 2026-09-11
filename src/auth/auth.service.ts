import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ExecuteService } from 'src/execute/execute.service';
import { LoginDto } from './dto/LoginDto';

@Injectable()
export class AuthService {
  constructor(private readonly executeService: ExecuteService) {}

  async login(dto: LoginDto) {
    const user = await this.executeService.execute('auth', 'auth', dto as any);
    if (!user)
      throw new UnauthorizedException('Correo o contraseña incorrectos');
    return user;
  }
}
