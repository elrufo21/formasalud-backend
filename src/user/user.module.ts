import { Module } from '@nestjs/common';

import { UserService } from './user.service';
import { UserController } from './user.controller';

import { ExecuteModule } from '../execute/execute.module';

@Module({
  imports: [ExecuteModule],
  controllers: [UserController],
  providers: [UserService],
})
export class UsersModule {}
