import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { Roles } from '../auth/auth.decorators';
import type { SaveTeacherDto } from './teacher.dto';
import { TeacherService } from './teacher.service';

@Controller('teacher')
@Roles('admin')
export class TeacherController {
  constructor(private readonly teachers: TeacherService) {}

  @Get()
  findAll() {
    return this.teachers.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.teachers.findOne(id);
  }

  @Post()
  create(@Body() data: SaveTeacherDto) {
    return this.teachers.create(data);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() data: SaveTeacherDto) {
    return this.teachers.update(id, data);
  }
}
