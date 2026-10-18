import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/api-exception.filter';
import { ApiResponseInterceptor } from './common/api-response.interceptor';
import * as express from 'express';
import * as path from 'path';
import * as fs from 'fs';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.useGlobalInterceptors(new ApiResponseInterceptor());
  app.useGlobalFilters(new ApiExceptionFilter());

  const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  app.use('/uploads/courses', express.static(path.join(uploadDir, 'courses')));
  app.use('/uploads/teachers', express.static(path.join(uploadDir, 'teachers')));

  const port = process.env.PORT ?? 4000;
  await app.listen(port);
  console.log(`FormaSalud Backend corriendo en http://localhost:${port}`);
}
bootstrap();
