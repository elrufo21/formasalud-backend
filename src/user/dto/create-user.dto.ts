export enum DocumentType {
  DNI = 'dni',
  CE = 'ce',
  PASSPORT = 'passport',
  OTHER = 'other',
}

export class CreateUserDto {
  name: string;
  last_name: string;
  email: string;
  password?: string;
  phone?: string;
  document_type?: DocumentType;
  document_number?: string;
  photo_url?: string;
  role_id?: number;
  role?: string;
}
