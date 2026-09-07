import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { DatabaseModule } from './database/database.module';
import { ExecuteModule } from './execute/execute.module';
import { UsersModule } from './user/user.module';
import { CourseModule } from './course/course.module';
import { CertificateModule } from './certificate/certificate.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    DatabaseModule,
    ExecuteModule,
    UsersModule,
    CourseModule,
    CertificateModule,
  ],
})
export class AppModule {}
