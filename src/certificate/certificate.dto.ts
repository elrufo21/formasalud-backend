export class GenerateCertificateDto {
  student_id: number;
  course_id: number;
  certificate_type?: 'participation' | 'approval' | 'speaker';
  certificate_code?: string;
  validate_payment?: boolean;
  payment_method?: string;
  transaction_code?: string;
}

