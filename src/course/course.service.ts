import { Injectable } from '@nestjs/common';
import { ExecuteService } from '../execute/execute.service';
import { CreateCourseDto } from './course.dto';

@Injectable()
export class CourseService {
  constructor(private readonly executeService: ExecuteService) {}

  create(createCourseDto: CreateCourseDto) {
    return this.executeService.execute('courses', 'i', createCourseDto as any);
  }

  findAll() {
    return this.executeService.execute('courses', 's');
  }

  getCombo() {
    return this.executeService.execute('courses', 'sc');
  }

  findOne(idOrSlug: string) {
    const isNum = !isNaN(Number(idOrSlug));
    return this.executeService.execute(
      'courses',
      's1',
      isNum ? { course_id: Number(idOrSlug) } : { slug: idOrSlug },
    );
  }
}
