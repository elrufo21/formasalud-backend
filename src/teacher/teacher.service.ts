import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { SaveTeacherDto } from './teacher.dto';
import type { QueryResultRow } from 'pg';

export interface TeacherRecord extends QueryResultRow {
  user_id: number;
  name: string;
  last_name: string;
  email: string;
  phone: string | null;
  document_type: string | null;
  document_number: string | null;
  photo_url: string | null;
  status: string;
  profession: string | null;
  specialty: string | null;
  biography: string | null;
  profile_photo_url: string | null;
  cover_photo_url: string | null;
  signature_url: string | null;
  created_at: Date | null;
}

const TEACHER_SELECT = `
  SELECT u.user_id, u.name, u.last_name, u.email, u.phone,
         u.document_type, u.document_number, u.photo_url, u.status,
         tp.profession, tp.specialty, tp.biography, tp.profile_photo_url,
         tp.cover_photo_url, tp.signature_url, tp.created_at
    FROM users u
    JOIN user_roles ur ON ur.user_id = u.user_id
    JOIN roles r ON r.role_id = ur.role_id AND r.name = 'teacher'
    LEFT JOIN teacher_profiles tp ON tp.user_id = u.user_id`;

@Injectable()
export class TeacherService {
  constructor(private readonly database: DatabaseService) {}

  async findAll() {
    const result = await this.database.query<TeacherRecord>(
      `${TEACHER_SELECT} ORDER BY u.last_name, u.name`,
    );
    return result.rows;
  }

  async findOne(id: number) {
    const result = await this.database.query<TeacherRecord>(
      `${TEACHER_SELECT} WHERE u.user_id = $1`,
      [id],
    );
    if (!result.rows[0]) throw new NotFoundException('Docente no encontrado');
    return result.rows[0];
  }

  create(input: SaveTeacherDto) {
    const data = this.normalize(input, true);
    return this.database.transaction(async (client) => {
      const duplicate = await client.query<{ present: number }>(
        'SELECT 1 AS present FROM users WHERE lower(email) = lower($1)',
        [data.email],
      );
      if (duplicate.rowCount)
        throw new ConflictException('Ya existe una cuenta con ese correo');

      await client.query(
        `SELECT public.fnc_execute($1, $2, $3::jsonb, $4::jsonb) AS data`,
        [
          'fnc_users',
          'i',
          JSON.stringify({
            name: data.name,
            last_name: data.last_name,
            email: data.email,
            password: data.password,
            phone: data.phone,
            document_type: data.document_type,
            document_number: data.document_number,
            photo_url: data.profile_photo_url,
            status: data.status ?? 'active',
            role: 'teacher',
          }),
          '{}',
        ],
      );

      const user = await client.query<{ user_id: number }>(
        `SELECT u.user_id FROM users u
         JOIN user_roles ur ON ur.user_id = u.user_id
         JOIN roles r ON r.role_id = ur.role_id AND r.name = 'teacher'
         WHERE lower(u.email) = lower($1)`,
        [data.email],
      );
      const userId = user.rows[0]?.user_id;
      if (!userId)
        throw new BadRequestException(
          'No se pudo crear la cuenta con rol docente',
        );

      await this.saveProfile(client, userId, data);
      return this.findOneInTransaction(client, userId);
    });
  }

  update(id: number, input: SaveTeacherDto) {
    const data = this.normalize(input, false);
    return this.database.transaction(async (client) => {
      const existing = await client.query<{ user_id: number }>(
        `SELECT u.user_id FROM users u
         JOIN user_roles ur ON ur.user_id = u.user_id
         JOIN roles r ON r.role_id = ur.role_id AND r.name = 'teacher'
         WHERE u.user_id = $1`,
        [id],
      );
      if (!existing.rowCount)
        throw new NotFoundException('Docente no encontrado');

      const duplicate = await client.query<{ present: number }>(
        'SELECT 1 AS present FROM users WHERE lower(email) = lower($1) AND user_id <> $2',
        [data.email, id],
      );
      if (duplicate.rowCount)
        throw new ConflictException('Ya existe una cuenta con ese correo');

      const userData: Record<string, unknown> = {
        user_id: id,
        name: data.name,
        last_name: data.last_name,
        email: data.email,
        phone: data.phone,
        document_type: data.document_type,
        document_number: data.document_number,
        photo_url: data.profile_photo_url,
        status: data.status,
      };
      if (data.password) userData.password = data.password;
      await client.query(
        `SELECT public.fnc_execute($1, $2, $3::jsonb, $4::jsonb) AS data`,
        ['fnc_users', 'u', JSON.stringify(userData), '{}'],
      );
      // fnc_users 'u' handles personal fields; account state is managed here
      // so the dedicated teacher module can suspend/re-enable access.
      await client.query(
        'UPDATE users SET status = $2, photo_url = $3 WHERE user_id = $1',
        [id, data.status ?? 'active', data.profile_photo_url],
      );
      await this.saveProfile(client, id, data);
      return this.findOneInTransaction(client, id);
    });
  }

  private normalize(input: SaveTeacherDto, creating: boolean) {
    const email = input.email?.trim().toLowerCase();
    if (!input.name?.trim() || !input.last_name?.trim() || !email) {
      throw new BadRequestException(
        'Nombres, apellidos y correo son obligatorios',
      );
    }
    if (creating && (!input.password || input.password.length < 12)) {
      throw new BadRequestException(
        'La contraseña inicial debe tener al menos 12 caracteres',
      );
    }
    if (input.password && input.password.length < 12) {
      throw new BadRequestException(
        'La contraseña debe tener al menos 12 caracteres',
      );
    }
    return {
      ...input,
      name: input.name.trim(),
      last_name: input.last_name.trim(),
      email,
      phone: input.phone?.trim() || null,
      document_type: input.document_type || null,
      document_number: input.document_number?.trim() || null,
      profession: input.profession?.trim() || null,
      specialty: input.specialty?.trim() || null,
      biography: input.biography?.trim() || null,
      profile_photo_url: input.profile_photo_url || null,
      cover_photo_url: input.cover_photo_url || null,
      signature_url: input.signature_url || null,
    };
  }

  private async saveProfile(
    client: import('pg').PoolClient,
    userId: number,
    data: SaveTeacherDto,
  ) {
    await client.query(
      `INSERT INTO teacher_profiles
         (user_id, profession, specialty, biography, profile_photo_url, cover_photo_url, signature_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id) DO UPDATE SET
         profession = EXCLUDED.profession,
         specialty = EXCLUDED.specialty,
         biography = EXCLUDED.biography,
         profile_photo_url = EXCLUDED.profile_photo_url,
         cover_photo_url = EXCLUDED.cover_photo_url,
         signature_url = EXCLUDED.signature_url`,
      [
        userId,
        data.profession,
        data.specialty,
        data.biography,
        data.profile_photo_url,
        data.cover_photo_url,
        data.signature_url,
      ],
    );
  }

  private async findOneInTransaction(
    client: import('pg').PoolClient,
    id: number,
  ) {
    const result = await client.query<TeacherRecord>(
      `${TEACHER_SELECT} WHERE u.user_id = $1`,
      [id],
    );
    return result.rows[0];
  }
}
