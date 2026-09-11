import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ExecuteModule } from 'src/execute/execute.module';
import { UsersModule } from 'src/user/user.module';

@Module({
  imports: [ExecuteModule, UsersModule],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
