import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ExecuteService } from '../execute/execute.service';
import { DatabaseService } from '../database/database.service';
import { CreateCourseDto } from './course.dto';

@Injectable()
export class CourseService {
  constructor(
    private readonly executeService: ExecuteService,
    private readonly databaseService: DatabaseService,
  ) {}

  async create(createCourseDto: CreateCourseDto) {
    const { teacher_ids = [], resources = [], certificate_configs = [], ...course } = createCourseDto;
    const teacherIds = this.normalizeTeacherIds(teacher_ids);
    this.validateRelations(teacherIds, resources, certificate_configs);

    return this.databaseService.transaction(async (client) => {
      const { rows: existingCourse } = await client.query(
        'SELECT 1 FROM public.courses WHERE slug = $1',
        [course.slug],
      );
      if (existingCourse.length) throw new ConflictException('Ya existe un curso con ese slug');

      await client.query(
        'SELECT public.fnc_execute($1, $2, $3::jsonb, $4::jsonb)',
        ['fnc_courses', 'i', JSON.stringify(course), '{}'],
      );

      const { rows: courseRows } = await client.query<{ course_id: string; slug: string }>(
        'SELECT course_id, slug FROM public.courses WHERE slug = $1 FOR UPDATE',
        [course.slug],
      );
      const createdCourse = courseRows[0];
      if (!createdCourse) throw new NotFoundException('No se encontró el curso recién creado');
      const courseId = createdCourse.course_id;

      if (teacherIds.length) {
        const { rows } = await client.query<{ user_id: string }>(
          `SELECT u.user_id
           FROM public.users u
           JOIN public.user_roles ur ON ur.user_id = u.user_id
           JOIN public.roles r ON r.role_id = ur.role_id AND r.name = 'teacher'
           WHERE u.user_id = ANY($1::bigint[]) AND u.status = 'active'`,
          [teacherIds],
        );
        if (rows.length !== teacherIds.length) {
          throw new BadRequestException('Uno o más docentes no existen, no están activos o no tienen el rol docente');
        }
        for (const userId of teacherIds) {
          await client.query(
            'INSERT INTO public.course_teachers (course_id, user_id) VALUES ($1, $2)',
            [courseId, userId],
          );
        }
      }

      for (const resource of resources) {
        await client.query(
          `INSERT INTO public.course_resources
            (course_id, resource_type, title, file_url, sort_order)
           VALUES ($1, $2::public.resource_type, $3, $4, $5)`,
          [courseId, resource.resource_type, resource.title.trim(), resource.file_url?.trim() || null, resource.sort_order ?? 0],
        );
      }

      for (const config of certificate_configs) {
        const { rows: templates } = await client.query<{ template_id: string }>(
          `SELECT template_id FROM public.certificate_templates
           WHERE template_id = $1 AND status = 'active'`,
          [config.template_id],
        );
        if (!templates.length) throw new BadRequestException('La plantilla seleccionada no está activa');
        await client.query(
          `INSERT INTO public.course_certificate_config
            (course_id, template_id, certificate_type, price)
           VALUES ($1, $2, $3::public.certificate_type_enum, $4)
           ON CONFLICT (course_id, certificate_type)
           DO UPDATE SET template_id = EXCLUDED.template_id,
                         price = EXCLUDED.price,
                         updated_at = now()`,
          [courseId, config.template_id, config.certificate_type, config.price ?? null],
        );
      }

      return { course_id: Number(courseId), ...course };
    });
  }

  async getFormOptions() {
    const [teachers, templates] = await Promise.all([
      this.databaseService.query<{ value: number; label: string; profession: string | null; specialty: string | null }>(
        `SELECT u.user_id AS value,
                concat_ws(' ', u.name, u.last_name) AS label,
                tp.profession, tp.specialty
         FROM public.users u
         JOIN public.user_roles ur ON ur.user_id = u.user_id
         JOIN public.roles r ON r.role_id = ur.role_id AND r.name = 'teacher'
         LEFT JOIN public.teacher_profiles tp ON tp.user_id = u.user_id
         WHERE u.status = 'active'
         ORDER BY u.name, u.last_name`,
      ),
      this.databaseService.query<{ template_id: number; name: string; status: 'active' | 'inactive' }>(
        `SELECT template_id, name, status FROM public.certificate_templates
         ORDER BY name`,
      ),
    ]);
    return {
      teachers: teachers.rows.map((teacher) => ({
        ...teacher,
        value: Number(teacher.value),
      })),
      certificate_templates: templates.rows,
    };
  }

  async findForEdit(courseId: number) {
    const result = await this.executeService.execute('courses', 's1', { course_id: courseId });
    const course = Array.isArray(result) ? result[0] : result;
    if (!course) throw new NotFoundException('No se encontró el curso');

    const [teachers, resources, configs] = await Promise.all([
      this.databaseService.query<{ user_id: number }>(
        'SELECT user_id FROM public.course_teachers WHERE course_id = $1 ORDER BY user_id',
        [courseId],
      ),
      this.databaseService.query<{ resource_type: string; title: string; file_url: string | null; sort_order: number }>(
        `SELECT resource_type, title, file_url, sort_order
         FROM public.course_resources WHERE course_id = $1 ORDER BY sort_order, resource_id`,
        [courseId],
      ),
      this.databaseService.query<{ certificate_type: 'participation' | 'approval'; template_id: number | null; price: number | null }>(
        `SELECT certificate_type, template_id, price
         FROM public.course_certificate_config WHERE course_id = $1
         ORDER BY certificate_type`,
        [courseId],
      ),
    ]);

    return {
      ...course,
      teacher_ids: teachers.rows.map((row) => Number(row.user_id)),
      resources: resources.rows,
      certificate_configs: configs.rows.filter((row) => row.template_id != null),
    };
  }

  async update(courseId: number, dto: CreateCourseDto) {
    const { teacher_ids = [], resources = [], certificate_configs = [], ...course } = dto;
    const teacherIds = this.normalizeTeacherIds(teacher_ids);
    this.validateRelations(teacherIds, resources, certificate_configs);
    if (!course.title?.trim() || !course.slug?.trim() || !Number.isFinite(Number(course.price)) || Number(course.price) < 0) {
      throw new BadRequestException('Los datos principales del curso no son válidos');
    }
    if (course.certificate_included === false && Number(course.certificate_price ?? 0) < 0) {
      throw new BadRequestException('El precio del certificado no puede ser negativo');
    }
    const status = course.status ?? 'draft';
    if (!['draft', 'published', 'archived'].includes(status)) {
      throw new BadRequestException('El estado del curso no es válido');
    }

    return this.databaseService.transaction(async (client) => {
      const { rows: currentRows } = await client.query<{
        course_id: string;
        title: string;
        certificate_included: boolean;
        certificate_price: string | null;
      }>(
        `SELECT course_id, title, certificate_included, certificate_price
         FROM public.courses WHERE course_id = $1 FOR UPDATE`,
        [courseId],
      );
      const currentCourse = currentRows[0];
      if (!currentCourse) throw new NotFoundException('No se encontró el curso');
      const { rows: duplicateSlug } = await client.query(
        'SELECT 1 FROM public.courses WHERE slug = $1 AND course_id <> $2',
        [course.slug.trim(), courseId],
      );
      if (duplicateSlug.length) throw new ConflictException('Ya existe otro curso con ese slug');

      if (teacherIds.length) {
        const { rows } = await client.query<{ user_id: string }>(
          `SELECT u.user_id FROM public.users u
           JOIN public.user_roles ur ON ur.user_id = u.user_id
           JOIN public.roles r ON r.role_id = ur.role_id AND r.name = 'teacher'
           WHERE u.user_id = ANY($1::bigint[]) AND u.status = 'active'`,
          [teacherIds],
        );
        if (rows.length !== teacherIds.length) {
          throw new BadRequestException('Uno o más docentes no existen, no están activos o no tienen el rol docente');
        }
      }

      const [{ rows: teacherRows }, { rows: issuedRows }, { rows: enrollmentRows }] = await Promise.all([
        client.query<{ user_id: string }>(
          'SELECT user_id FROM public.course_teachers WHERE course_id = $1 ORDER BY user_id',
          [courseId],
        ),
        client.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM public.certificates cert
           JOIN public.enrollments e ON e.enrollment_id = cert.enrollment_id
           WHERE e.course_id = $1`,
          [courseId],
        ),
        client.query<{ count: string }>(
          'SELECT count(*)::text AS count FROM public.enrollments WHERE course_id = $1',
          [courseId],
        ),
      ]);
      const hasIssuedCertificates = Number(issuedRows[0]?.count ?? 0) > 0;
      const hasEnrollments = Number(enrollmentRows[0]?.count ?? 0) > 0;
      const currentTeacherIds = teacherRows.map((row) => Number(row.user_id)).sort((a, b) => a - b);
      const requestedTeacherIds = [...teacherIds].sort((a, b) => a - b);
      const teachersChanged = currentTeacherIds.length !== requestedTeacherIds.length ||
        currentTeacherIds.some((id, index) => id !== requestedTeacherIds[index]);
      if (hasIssuedCertificates && (currentCourse.title !== course.title.trim() || teachersChanged)) {
        throw new ConflictException('No se puede cambiar el título o docentes de un curso con certificados emitidos, para conservar su contenido histórico.');
      }
      if (hasEnrollments && (
        currentCourse.certificate_included !== (course.certificate_included ?? true) ||
        Number(currentCourse.certificate_price ?? 0) !== Number(course.certificate_price ?? 0)
      )) {
        throw new ConflictException('No se puede cambiar la regla de precio del certificado porque el curso ya tiene alumnos matriculados.');
      }

      await client.query(
        `UPDATE public.courses SET
          title = $2, slug = $3, short_description = $4, description = $5,
          price = $6, certificate_included = $7, certificate_price = $8,
          thumbnail_url = CASE WHEN $9 THEN $10 ELSE thumbnail_url END,
          status = $11::public.course_status,
          published_at = CASE WHEN $11 = 'published' THEN COALESCE(published_at, now()) ELSE published_at END,
          updated_at = now()
         WHERE course_id = $1`,
        [courseId, course.title.trim(), course.slug.trim(), course.short_description?.trim() || null,
          course.description?.trim() || null, course.price, course.certificate_included ?? true,
          course.certificate_included === false ? course.certificate_price ?? 0 : null,
          course.thumbnail_url !== undefined, course.thumbnail_url ?? null, status],
      );

      await client.query('DELETE FROM public.course_teachers WHERE course_id = $1', [courseId]);
      for (const userId of teacherIds) {
        await client.query('INSERT INTO public.course_teachers (course_id, user_id) VALUES ($1, $2)', [courseId, userId]);
      }

      await client.query('DELETE FROM public.course_resources WHERE course_id = $1', [courseId]);
      for (const resource of resources) {
        await client.query(
          `INSERT INTO public.course_resources
            (course_id, resource_type, title, file_url, sort_order)
           VALUES ($1, $2::public.resource_type, $3, $4, $5)`,
          [courseId, resource.resource_type, resource.title.trim(), resource.file_url?.trim() || null, resource.sort_order ?? 0],
        );
      }

      const { rows: currentConfigs } = await client.query<{
        course_certificate_config_id: string;
        certificate_type: 'participation' | 'approval';
        template_id: number | null;
        price: string | null;
        has_issued_certificates: boolean;
      }>(
        `SELECT config.course_certificate_config_id, config.certificate_type,
                config.template_id, config.price,
                EXISTS (
                  SELECT 1 FROM public.certificates cert
                  WHERE cert.course_certificate_config_id = config.course_certificate_config_id
                ) AS has_issued_certificates
         FROM public.course_certificate_config config
         WHERE config.course_id = $1 FOR UPDATE`,
        [courseId],
      );
      const requestedByType = new Map(certificate_configs.map((config) => [config.certificate_type, config]));
      for (const current of currentConfigs) {
        const requested = requestedByType.get(current.certificate_type);
        const unchanged = requested && Number(requested.template_id) === Number(current.template_id) &&
          (requested.price == null ? current.price == null : Number(requested.price) === Number(current.price));
        if ((current.has_issued_certificates || hasEnrollments) && !unchanged) {
          throw new ConflictException(
            `No se puede cambiar la plantilla o precio de ${current.certificate_type} porque el curso ya tiene matrículas o certificados emitidos.`,
          );
        }
      }

      for (const config of certificate_configs) {
        const existing = currentConfigs.find((item) => item.certificate_type === config.certificate_type);
        const unchanged = existing && Number(existing.template_id) === Number(config.template_id) &&
          (config.price == null ? existing.price == null : Number(config.price) === Number(existing.price));
        if (unchanged) {
          requestedByType.delete(config.certificate_type);
          continue;
        }
        const { rows: templates } = await client.query(
          `SELECT 1 FROM public.certificate_templates WHERE template_id = $1 AND status = 'active'`,
          [config.template_id],
        );
        if (!templates.length) throw new BadRequestException('La plantilla seleccionada no está activa');
        await client.query(
          `INSERT INTO public.course_certificate_config
            (course_id, template_id, certificate_type, price)
           VALUES ($1, $2, $3::public.certificate_type_enum, $4)
           ON CONFLICT (course_id, certificate_type)
           DO UPDATE SET template_id = EXCLUDED.template_id,
                         price = EXCLUDED.price, updated_at = now()`,
          [courseId, config.template_id, config.certificate_type, config.price ?? null],
        );
        requestedByType.delete(config.certificate_type);
      }

      for (const configType of requestedByType.keys()) {
        await client.query(
          'DELETE FROM public.course_certificate_config WHERE course_id = $1 AND certificate_type = $2::public.certificate_type_enum',
          [courseId, configType],
        );
      }

      if (hasEnrollments) {
        const existingTypes = new Set(currentConfigs.map((config) => config.certificate_type));
        if (certificate_configs.some((config) => !existingTypes.has(config.certificate_type))) {
          throw new ConflictException('No se puede añadir una configuración de certificado nueva cuando el curso ya tiene matrículas.');
        }
      }

      return { course_id: courseId, ...course, status };
    });
  }

  private validateRelations(
    teacherIds: number[],
    resources: CreateCourseDto['resources'],
    configs: CreateCourseDto['certificate_configs'],
  ) {
    if (!Array.isArray(teacherIds) || teacherIds.some((id) => !Number.isSafeInteger(id) || id <= 0) || new Set(teacherIds).size !== teacherIds.length) {
      throw new BadRequestException('La lista de docentes no es válida');
    }
    const resourceTypes = new Set(['video', 'pdf', 'link', 'quiz', 'other']);
    if (!Array.isArray(resources) || resources.some((resource) =>
      !resourceTypes.has(resource.resource_type) || !resource.title?.trim() || resource.title.length > 200 ||
      (resource.sort_order !== undefined && (!Number.isInteger(resource.sort_order) || resource.sort_order < 0))
    )) throw new BadRequestException('Uno o más recursos del curso no son válidos');
    const certificateTypes = new Set(['participation', 'approval']);
    if (!Array.isArray(configs) || configs.some((config) =>
      !certificateTypes.has(config.certificate_type) || !Number.isSafeInteger(config.template_id) || config.template_id <= 0 ||
      (config.price != null && (!Number.isFinite(config.price) || config.price < 0))
    ) || new Set(configs.map((config) => config.certificate_type)).size !== configs.length) {
      throw new BadRequestException('La configuración de certificados no es válida');
    }
  }

  private normalizeTeacherIds(value: unknown): number[] {
    if (!Array.isArray(value)) {
      throw new BadRequestException('La lista de docentes no es válida');
    }
    return value.map((id: unknown) =>
      typeof id === 'string' && /^\d+$/.test(id.trim()) ? Number(id) : id,
    ) as number[];
  }

  findAll() {
    return this.executeService.execute('courses', 's');
  }

  async findPublished() {
    const result = await this.executeService.execute('courses', 's');
    const courses = Array.isArray(result) ? result : result ? [result] : [];
    const published = courses
      .filter((course) => course?.status === 'published')
      .map((course) => ({
        course_id: course.course_id,
        title: course.title,
        slug: course.slug,
        description: course.description,
        short_description: course.short_description,
        price: course.price,
        certificate_included: course.certificate_included,
        certificate_price: course.certificate_price,
        thumbnail_url: course.thumbnail_url,
        published_at: course.published_at,
      }));
    return this.attachPublicTeachers(published);
  }

  async findPublishedOne(slug: string) {
    const result = await this.findOne(slug);
    const course = Array.isArray(result) ? result[0] : result;
    if (!course || course.status !== 'published') return null;
    const { status: _status, created_at: _created, updated_at: _updated, ...publicCourse } = course;
    const [withTeachers] = await this.attachPublicTeachers([{
      course_id: publicCourse.course_id,
      title: publicCourse.title,
      slug: publicCourse.slug,
      description: publicCourse.description,
      short_description: publicCourse.short_description,
      price: publicCourse.price,
      certificate_included: publicCourse.certificate_included,
      certificate_price: publicCourse.certificate_price,
      thumbnail_url: publicCourse.thumbnail_url,
      published_at: publicCourse.published_at,
    }]);
    return withTeachers;
  }

  private async attachPublicTeachers<T extends { course_id: number }>(courses: T[]) {
    if (courses.length === 0) return courses;
    const { rows } = await this.databaseService.query<{
      course_id: number;
      name: string;
      last_name: string;
      profession: string | null;
      specialty: string | null;
      profile_photo_url: string | null;
    }>(
      `
        SELECT ct.course_id, u.name, u.last_name,
               tp.profession, tp.specialty, tp.profile_photo_url
        FROM public.course_teachers ct
        JOIN public.users u ON u.user_id = ct.user_id
        LEFT JOIN public.teacher_profiles tp ON tp.user_id = u.user_id
        WHERE ct.course_id = ANY($1::bigint[]) AND u.status = 'active'
        ORDER BY ct.course_id, u.name, u.last_name
      `,
      [courses.map((course) => course.course_id)],
    );
    const byCourse = new Map<number, typeof rows>();
    for (const row of rows) {
      const courseId = Number(row.course_id);
      const teachers = byCourse.get(courseId) ?? [];
      teachers.push(row);
      byCourse.set(courseId, teachers);
    }
    return courses.map((course) => ({
      ...course,
      teachers: (byCourse.get(Number(course.course_id)) ?? []).map((teacher) => ({
        name: teacher.name,
        last_name: teacher.last_name,
        profession: teacher.profession,
        specialty: teacher.specialty,
        profile_photo_url: teacher.profile_photo_url,
      })),
    }));
  }

  getCombo() {
    return this.executeService.execute('courses', 'sc');
  }

  findOne(idOrSlug: string) {
    const isNum = !isNaN(Number(idOrSlug));
    return this.executeService.execute(
      'courses',
      's1',
      isNum ? { course_id: Number(idOrSlug) } : { slug: idOrSlug },
    );
  }
}
