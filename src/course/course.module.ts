import { Module } from '@nestjs/common';
import { CourseService } from './course.service';
import { CourseController } from './course.controller';
import { PublicCourseController } from './public-course.controller';
import { ExecuteModule } from '../execute/execute.module';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [ExecuteModule, DatabaseModule],
  controllers: [CourseController, PublicCourseController],
  providers: [CourseService],
  exports: [CourseService],
})
export class CourseModule {}
