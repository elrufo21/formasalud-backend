import { Injectable } from '@nestjs/common';
import { ExecuteService } from '../execute/execute.service';
import { GenerateCertificateDto } from './certificate.dto';

@Injectable()
export class CertificateService {
  constructor(private readonly executeService: ExecuteService) {}

  generate(dto: GenerateCertificateDto) {
    return this.executeService.execute('certificates', 'generate', dto as any);
  }

  checkEligibility(studentId: number, courseId: number) {
    return this.executeService.execute('certificates', 'check_eligibility', {
      student_id: studentId,
      course_id: courseId,
    });
  }

  verify(code: string) {
    return this.executeService.execute('certificates', 'verify', { code });
  }

  findAll() {
    return this.executeService.execute('certificates', 's');
  }

  findOne(idOrCode: string) {
    const isNum = !isNaN(Number(idOrCode));
    return this.executeService.execute(
      'certificates',
      's1',
      isNum ? { certificate_id: Number(idOrCode) } : { certificate_code: idOrCode },
    );
  }
}
