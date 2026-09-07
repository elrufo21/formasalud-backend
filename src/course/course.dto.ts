export class CreateCourseDto {
  title: string;
  slug: string;
  short_description?: string;
  description?: string;
  price?: number;
  certificate_included?: boolean;
  certificate_price?: number;
  thumbnail_url?: string;
}
