export type CourseResourceType = 'video' | 'pdf' | 'link' | 'quiz' | 'other';
export type CertificateType = 'participation' | 'approval';

export interface CreateCourseResourceDto {
  resource_type: CourseResourceType;
  title: string;
  file_url?: string | null;
  sort_order?: number;
}

export interface CreateCourseCertificateConfigDto {
  certificate_type: CertificateType;
  template_id: number;
  price?: number | null;
}

export class CreateCourseDto {
  title!: string;
  slug!: string;
  short_description?: string;
  description?: string;
  price?: number;
  certificate_included?: boolean;
  certificate_price?: number;
  thumbnail_url?: string;
  teacher_ids?: number[];
  resources?: CreateCourseResourceDto[];
  certificate_configs?: CreateCourseCertificateConfigDto[];
  status?: 'draft' | 'published' | 'archived';
}
