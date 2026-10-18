import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { CourseService } from './course.service';
import { CreateCourseDto } from './course.dto';
import { Roles } from 'src/auth/auth.decorators';

@Controller('course')
@Roles('admin')
export class CourseController {
  constructor(private readonly courseService: CourseService) {}

  @Post()
  create(@Body() createCourseDto: CreateCourseDto) {
    return this.courseService.create(createCourseDto);
  }

  @Get('form-options')
  getFormOptions() {
    return this.courseService.getFormOptions();
  }

  @Get(':courseId/edit')
  getForEdit(@Param('courseId', ParseIntPipe) courseId: number) {
    return this.courseService.findForEdit(courseId);
  }

  @Patch(':courseId')
  update(
    @Param('courseId', ParseIntPipe) courseId: number,
    @Body() updateCourseDto: CreateCourseDto,
  ) {
    return this.courseService.update(courseId, updateCourseDto);
  }

  @Get()
  findAll() {
    return this.courseService.findAll();
  }

  @Get('combo')
  getCombo() {
    return this.courseService.getCombo();
  }

  @Get(':idOrSlug')
  findOne(@Param('idOrSlug') idOrSlug: string) {
    return this.courseService.findOne(idOrSlug);
  }
}
