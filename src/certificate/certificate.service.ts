import { Injectable } from '@nestjs/common';
import { ExecuteService } from '../execute/execute.service';
import { GenerateCertificateDto } from './certificate.dto';
import { DatabaseService } from '../database/database.service';

type CertificateRecord = Record<string, unknown> & { certificate_code?: string };

@Injectable()
export class CertificateService {
  constructor(
    private readonly executeService: ExecuteService,
    private readonly databaseService: DatabaseService,
  ) {}

  generate(dto: GenerateCertificateDto) {
    return this.executeService.execute('certificates', 'generate', dto as any);
  }

  checkEligibility(studentId: number, courseId: number) {
    return this.executeService.execute('certificates', 'check_eligibility', {
      student_id: studentId,
      course_id: courseId,
    });
  }

  async verify(code: string) {
    return this.withTemplate(await this.executeService.execute('certificates', 'verify', { code }));
  }

  async findAll() {
    return this.withTemplate(await this.executeService.execute('certificates', 's'));
  }

  async findOne(idOrCode: string) {
    const isNum = !isNaN(Number(idOrCode));
    return this.withTemplate(await this.executeService.execute(
      'certificates',
      's1',
      isNum ? { certificate_id: Number(idOrCode) } : { certificate_code: idOrCode },
    ));
  }

  private async withTemplate(value: CertificateRecord | CertificateRecord[] | null) {
    const certificates = Array.isArray(value) ? value : value ? [value] : [];
    const codes = certificates.map((certificate) => certificate.certificate_code).filter((code): code is string => !!code);
    if (!codes.length) return value;
    const { rows } = await this.databaseService.query<{ certificate_code: string; config_json: Record<string, unknown> }>(
      `SELECT cert.certificate_code, template.config_json
       FROM public.certificates cert
       JOIN public.course_certificate_config config ON config.course_certificate_config_id = cert.course_certificate_config_id
       JOIN public.certificate_templates template ON template.template_id = config.template_id
       WHERE cert.certificate_code = ANY($1::text[])`,
      [codes],
    );
    const configs = new Map(rows.map((row) => [row.certificate_code, row.config_json]));
    const enriched = certificates.map((certificate) => {
      const config = configs.get(certificate.certificate_code ?? '');
      return config ? {
        ...certificate,
        template_key: typeof config.layout === 'string' ? config.layout : undefined,
        hours: config.hours ?? certificate.hours,
        hours_unit: config.hours_unit ?? certificate.hours_unit,
        course_date_text: config.course_date_text ?? certificate.course_date_text,
      } : certificate;
    });
    return Array.isArray(value) ? enriched : enriched[0];
  }
}
