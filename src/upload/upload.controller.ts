import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  Body,
  BadRequestException,
  UseGuards,
  Get,
  Param,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { Public, Roles } from 'src/auth/auth.decorators';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { CourseImageUploadGuard } from './course-image-upload.guard';

const ALLOWED_FOLDERS = ['courses', 'teachers', 'teacher-signatures', 'certificates', 'vouchers', 'general'];
const IMAGE_FOLDERS = new Set(['courses', 'teachers', 'teacher-signatures']);
const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
type UploadFile = { originalname: string; mimetype: string; size: number; path: string; filename: string };

function getUploadBaseDir(): string {
  return process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
}

function imageFileFilter(_req: unknown, file: Pick<UploadFile, 'originalname' | 'mimetype'>, cb: (error: Error | null, acceptFile: boolean) => void) {
  const validExtension = /\.(jpe?g|png|webp)$/i.test(file.originalname);
  if (!IMAGE_MIME_TYPES.has(file.mimetype) || !validExtension) {
    return cb(new BadRequestException('Solo se permiten imágenes JPG, PNG o WebP'), false);
  }
  cb(null, true);
}

function validateImageFile(file: UploadFile) {
  if (file.size > MAX_IMAGE_SIZE) {
    fs.unlink(file.path, () => undefined);
    throw new BadRequestException('La imagen no puede superar los 5 MB');
  }
  const signature = fs.readFileSync(file.path).subarray(0, 12);
  const isJpeg = signature[0] === 0xff && signature[1] === 0xd8 && signature[2] === 0xff;
  const isPng = signature.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isWebp = signature.toString('ascii', 0, 4) === 'RIFF' && signature.toString('ascii', 8, 12) === 'WEBP';
  if (!isJpeg && !isPng && !isWebp) {
    fs.unlink(file.path, () => undefined);
    throw new BadRequestException('El archivo no contiene una imagen JPG, PNG o WebP válida');
  }
}

function uniqueFilename(file: Pick<UploadFile, 'originalname'>) {
  const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
  const ext = path.extname(file.originalname).toLowerCase();
  const cleanName = path
    .basename(file.originalname, ext)
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .substring(0, 30);
  return `${cleanName}-${uniqueSuffix}${ext}`;
}

@Controller('upload')
@Roles('admin')
export class UploadController {
  @Get('signatures/:filename')
  getTeacherSignature(@Param('filename') filename: string) {
    if (!/^[a-zA-Z0-9_-]+\.(jpe?g|png|webp)$/i.test(filename)) {
      throw new NotFoundException('Firma no encontrada');
    }
    const filePath = path.join(getUploadBaseDir(), 'teacher-signatures', filename);
    if (!fs.existsSync(filePath)) throw new NotFoundException('Firma no encontrada');
    const extension = path.extname(filename).toLowerCase();
    const type = extension === '.png'
      ? 'image/png'
      : extension === '.webp'
        ? 'image/webp'
        : 'image/jpeg';
    return new StreamableFile(fs.createReadStream(filePath), { type });
  }

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const folder = req.body?.folder && ALLOWED_FOLDERS.includes(req.body.folder)
            ? req.body.folder
            : 'general';
          const targetDir = path.join(getUploadBaseDir(), folder);
          if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
          }
          cb(null, targetDir);
        },
        filename: (req, file, cb) => {
          cb(null, uniqueFilename(file));
        },
      }),
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB
      },
      fileFilter: (req, file, cb) => {
        const folder = req.body?.folder;
        if (!IMAGE_FOLDERS.has(folder)) return cb(null, true);
        imageFileFilter(req, file, cb);
      },
    }),
  )
  uploadFile(
    @UploadedFile() file: any,
    @Body('folder') folder?: string,
  ) {
    if (!file) {
      throw new BadRequestException('No se proporcionó ningún archivo');
    }

    const safeFolder = folder && ALLOWED_FOLDERS.includes(folder) ? folder : 'general';
    if (IMAGE_FOLDERS.has(safeFolder)) validateImageFile(file);
    const relativeUrl = `/uploads/${safeFolder}/${file.filename}`;

    return {
      filename: file.filename,
      originalName: file.originalname,
      size: file.size,
      mimetype: file.mimetype,
      url: relativeUrl,
    };
  }

  @Public()
  @Post('course-image')
  @UseGuards(CourseImageUploadGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const targetDir = path.join(getUploadBaseDir(), 'courses');
          if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
          cb(null, targetDir);
        },
        filename: (_req, file, cb) => cb(null, uniqueFilename(file)),
      }),
      limits: { fileSize: MAX_IMAGE_SIZE },
      fileFilter: imageFileFilter,
    }),
  )
  uploadCourseImage(@UploadedFile() file: UploadFile) {
    if (!file) throw new BadRequestException('No se proporcionó ninguna imagen');
    validateImageFile(file);
    return {
      filename: file.filename,
      originalName: file.originalname,
      size: file.size,
      mimetype: file.mimetype,
      url: `/uploads/courses/${file.filename}`,
    };
  }
}
