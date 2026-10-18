export type TeacherStatus = 'active' | 'inactive' | 'suspended';

export interface SaveTeacherDto {
  name: string;
  last_name: string;
  email: string;
  password?: string;
  phone?: string | null;
  document_type?: string | null;
  document_number?: string | null;
  status?: TeacherStatus;
  profession?: string | null;
  specialty?: string | null;
  biography?: string | null;
  profile_photo_url?: string | null;
  cover_photo_url?: string | null;
  signature_url?: string | null;
}
