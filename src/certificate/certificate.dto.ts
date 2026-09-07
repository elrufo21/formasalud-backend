export class GenerateCertificateDto {
  student_id: number;
  course_id: number;
  certificate_type?: 'participation' | 'approval';
  certificate_code?: string;
  validate_payment?: boolean;
  payment_method?: string;
  transaction_code?: string;
}

