import { Module } from '@nestjs/common';

import { ExecuteService } from './execute.service';
import { ExecuteController } from './execute.controller';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [ExecuteController],
  providers: [ExecuteService],
  exports: [ExecuteService],
})
export class ExecuteModule {}
