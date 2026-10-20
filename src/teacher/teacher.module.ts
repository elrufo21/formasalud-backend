import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { TeacherController } from './teacher.controller';
import { TeacherService } from './teacher.service';

@Module({
  imports: [DatabaseModule],
  controllers: [TeacherController],
  providers: [TeacherService],
})
export class TeacherModule {}
