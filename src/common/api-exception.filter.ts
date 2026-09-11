import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

interface ExceptionBody {
  message?: string | string[];
  error?: string;
}

interface DatabaseException {
  code?: string;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const isHttpException = exception instanceof HttpException;
    const status = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const databaseCode = (exception as DatabaseException)?.code;
    const body = isHttpException
      ? (exception.getResponse() as string | ExceptionBody)
      : undefined;
    const messages = this.getMessages(body, exception);
    const code = databaseCode
      ? 'DATABASE_ERROR'
      : this.getErrorCode(status, body);

    if (!isHttpException) {
      this.logger.error(exception);
    }

    response.status(status).json({
      status,
      message: messages[0],
      data: null,
      errors: messages.map((message) => ({ code, message })),
    });
  }

  private getMessages(
    body: string | ExceptionBody | undefined,
    exception: unknown,
  ): string[] {
    if (typeof body === 'string') return [body];
    if (Array.isArray(body?.message)) return body.message;
    if (typeof body?.message === 'string') return [body.message];
    if (body?.error) return [body.error];
    if ((exception as DatabaseException)?.code) {
      return ['No se pudo completar la operación en la base de datos'];
    }
    return ['Ocurrió un error interno'];
  }

  private getErrorCode(
    status: number,
    body: string | ExceptionBody | undefined,
  ): string {
    if (typeof body !== 'string' && body?.error) {
      return body.error.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
    }

    return HttpStatus[status]?.replace(/[^A-Z0-9]+/g, '_') ?? 'API_ERROR';
  }
}
