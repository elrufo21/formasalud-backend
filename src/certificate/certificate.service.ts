import { Injectable } from '@nestjs/common';
import { ExecuteService } from '../execute/execute.service';
import { GenerateCertificateDto } from './certificate.dto';
import { DatabaseService } from '../database/database.service';

type CertificateRecord = {
  valid?: boolean;
  certificate_id?: number;
  certificate_code?: string;
  code?: string;
  certificate_type?: string;
  status?: string;
  issued_at?: string;
  student_id?: number;
  student_name?: string;
  course_id?: number;
  course_title?: string;
  hours?: number;
  hours_unit?: string;
  course_date_text?: string;
  template_key?: string;
  teacher_name?: string;
  coordinator_name?: string;
  student?: {
    user_id?: number;
    student_id?: number;
    full_name?: string;
    name?: string;
    last_name?: string;
  };
  course?: { course_id?: number; slug?: string; title?: string };
};

@Injectable()
export class CertificateService {
  constructor(
    private readonly executeService: ExecuteService,
    private readonly databaseService: DatabaseService,
  ) {}

  generate(dto: GenerateCertificateDto) {
    return this.executeService.execute('certificates', 'generate', {
      ...dto,
      validate_payment: true,
    });
  }

  checkEligibility(studentId: number, courseId: number) {
    return this.executeService.execute('certificates', 'check_eligibility', {
      student_id: studentId,
      course_id: courseId,
    });
  }

  async verify(code: string) {
    const result = (await this.executeService.execute(
      'certificates',
      'verify',
      {
        code,
      },
    )) as unknown as CertificateRecord | CertificateRecord[] | null;
    const hasCertificate = Array.isArray(result)
      ? result.some((item) => item?.certificate_code)
      : result?.certificate_code;
    const template = hasCertificate
      ? (
          await this.databaseService.query<{
            config_json: Record<string, unknown>;
          }>(
            `SELECT t.config_json FROM public.certificates cert
           JOIN public.course_certificate_config cfg ON cfg.course_certificate_config_id = cert.course_certificate_config_id
           JOIN public.certificate_templates t ON t.template_id = cfg.template_id
           WHERE cert.certificate_code = $1`,
            [code],
          )
        ).rows[0]?.config_json
      : undefined;
    const layout = typeof template?.layout === 'string' ? template.layout : undefined;
    const project = (certificate: CertificateRecord | null) => {
      if (!certificate) return certificate;
      const student = certificate.student;
      const course = certificate.course;
      return {
        valid: certificate.valid,
        certificate_id: certificate.certificate_id,
        certificate_code: certificate.certificate_code ?? certificate.code,
        certificate_type: certificate.certificate_type,
        status: certificate.status,
        issued_at: certificate.issued_at,
        course_id: certificate.course_id ?? course?.course_id,
        course: {
          slug: course?.slug,
          title: course?.title ?? certificate.course_title,
        },
        student_name:
          certificate.student_name ??
          student?.full_name ??
          ([student?.name, student?.last_name].filter(Boolean).join(' ') ||
            undefined),
        course_title: certificate.course_title ?? course?.title,
        hours: template?.hours ?? certificate.hours,
        hours_unit: template?.hours_unit,
        course_date_text: template?.course_date_text ?? certificate.course_date_text,
        teacher_name: certificate.teacher_name,
        coordinator_name: certificate.coordinator_name,
        template_key: layout,
      };
    };
    return Array.isArray(result) ? result.map(project) : project(result);
  }

  async findAll() {
    return this.withTemplate(
      (await this.executeService.execute('certificates', 's')) as
        | CertificateRecord
        | CertificateRecord[]
        | null,
    );
  }

  async findMine(studentId: number) {
    const result = (await this.findAll()) as unknown as
      | CertificateRecord
      | CertificateRecord[]
      | null;
    const certificates = Array.isArray(result)
      ? result
      : result
        ? [result]
        : [];
    return certificates.filter(
      (certificate) =>
        Number(
          certificate.student_id ??
            certificate.student?.user_id ??
            certificate.student?.student_id,
        ) === studentId,
    );
  }

  async findOne(idOrCode: string) {
    const isNum = !isNaN(Number(idOrCode));
    return this.withTemplate(
      (await this.executeService.execute(
        'certificates',
        's1',
        isNum
          ? { certificate_id: Number(idOrCode) }
          : { certificate_code: idOrCode },
      )) as CertificateRecord | CertificateRecord[] | null,
    );
  }

  private async withTemplate(
    value: CertificateRecord | CertificateRecord[] | null,
  ) {
    const certificates = Array.isArray(value) ? value : value ? [value] : [];
    const codes = certificates
      .map((certificate) => certificate.certificate_code)
      .filter((code): code is string => !!code);
    if (!codes.length) return value;
    const { rows } = await this.databaseService.query<{
      certificate_code: string;
      config_json: Record<string, unknown>;
    }>(
      `SELECT cert.certificate_code, t.config_json
       FROM public.certificates cert
       JOIN public.course_certificate_config cfg ON cfg.course_certificate_config_id = cert.course_certificate_config_id
       JOIN public.certificate_templates t ON t.template_id = cfg.template_id
       WHERE cert.certificate_code = ANY($1::text[])`,
      [codes],
    );
    const configs = new Map(
      rows.map((row) => [row.certificate_code, row.config_json]),
    );
    const enriched = certificates.map((certificate) => {
      const config = configs.get(certificate.certificate_code ?? '');
      return {
        ...certificate,
        template_key:
          typeof config?.layout === 'string' ? config.layout : undefined,
        hours: config?.hours ?? certificate.hours,
        hours_unit: config?.hours_unit ?? certificate.hours_unit,
        course_date_text:
          config?.course_date_text ?? certificate.course_date_text,
      };
    });
    return Array.isArray(value) ? enriched : enriched[0];
  }
}
