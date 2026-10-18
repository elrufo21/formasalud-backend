import { Module } from '@nestjs/common';
import { UploadController } from './upload.controller';
import { CourseImageUploadGuard } from './course-image-upload.guard';

@Module({
  controllers: [UploadController],
  providers: [CourseImageUploadGuard],
})
export class UploadModule {}
