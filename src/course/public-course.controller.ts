import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { CourseService } from './course.service';
import { Public } from 'src/auth/auth.decorators';

@Controller('courses')
@Public()
export class PublicCourseController {
  constructor(private readonly courseService: CourseService) {}

  @Get()
  list() {
    return this.courseService.findPublished();
  }

  @Get(':slug')
  async detail(@Param('slug') slug: string) {
    const course = await this.courseService.findPublishedOne(slug);
    if (!course) throw new NotFoundException('Curso no encontrado');
    return course;
  }
}
