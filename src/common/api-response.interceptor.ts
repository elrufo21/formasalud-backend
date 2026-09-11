import {
  CallHandler,
  ExecutionContext,
  HttpStatus,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ApiErrorDetail {
  code: string;
  message: string;
}

export interface ApiResponse<T> {
  status: number;
  message: string;
  data: T | null;
  errors: ApiErrorDetail[];
}

@Injectable()
export class ApiResponseInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponse<T>> {
    const request = context.switchToHttp().getRequest<{ method: string }>();
    const status =
      Reflect.getMetadata(HTTP_CODE_METADATA, context.getHandler()) ??
      (request.method === 'POST' ? HttpStatus.CREATED : HttpStatus.OK);

    return next.handle().pipe(
      map((data) => ({
        status,
        message: 'Operación realizada con éxito',
        data: data ?? null,
        errors: [],
      })),
    );
  }
}
