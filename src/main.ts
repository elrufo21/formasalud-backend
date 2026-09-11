import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/api-exception.filter';
import { ApiResponseInterceptor } from './common/api-response.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.useGlobalInterceptors(new ApiResponseInterceptor());
  app.useGlobalFilters(new ApiExceptionFilter());
  const port = process.env.PORT ?? 4000;
  await app.listen(port);
  console.log(`FormaSalud Backend corriendo en http://localhost:${port}`);
}
bootstrap();
