import { Module } from '@nestjs/common';
import { CertificateService } from './certificate.service';
import { CertificateController } from './certificate.controller';
import { ExecuteModule } from '../execute/execute.module';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [ExecuteModule, DatabaseModule],
  controllers: [CertificateController],
  providers: [CertificateService],
  exports: [CertificateService],
})
export class CertificateModule {}
