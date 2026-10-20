import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';

@Injectable()
export class CourseImageUploadGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext) {
    const expected = this.config.get<string>('COURSE_IMAGE_UPLOAD_TOKEN') ?? '';
    const request = context.switchToHttp().getRequest();
    const received = request.headers['x-course-image-upload-token'];
    if (!expected || expected.length < 32 || typeof received !== 'string') {
      throw new UnauthorizedException('Subida de imagen no autorizada');
    }

    const expectedBuffer = Buffer.from(expected);
    const receivedBuffer = Buffer.from(received);
    if (
      expectedBuffer.length !== receivedBuffer.length ||
      !timingSafeEqual(expectedBuffer, receivedBuffer)
    ) {
      throw new UnauthorizedException('Subida de imagen no autorizada');
    }
    return true;
  }
}
