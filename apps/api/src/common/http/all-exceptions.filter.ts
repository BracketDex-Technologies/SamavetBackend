import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();
    const status = exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const payload = exception instanceof HttpException ? exception.getResponse() : undefined;
    const message = readMessage(payload, exception, status);
    const requestId = response.getHeader('x-request-id') || request.header('x-request-id');

    if (status >= 500) {
      this.logger.error(JSON.stringify({
        error: exception instanceof Error ? exception.message : 'Unknown error',
        method: request.method,
        path: request.originalUrl,
        requestId,
        statusCode: status,
      }), exception instanceof Error ? exception.stack : undefined);
    }

    response.status(status).json({
      error: HttpStatus[status] ?? 'Error',
      message,
      path: request.originalUrl,
      requestId,
      statusCode: status,
      timestamp: new Date().toISOString(),
    });
  }
}

function readMessage(payload: string | object | undefined, exception: unknown, status: number) {
  if (typeof payload === 'string') return payload;
  if (payload && 'message' in payload) {
    const message = (payload as { message?: string | string[] }).message;
    if (message) return message;
  }
  if (status < 500 && exception instanceof Error) return exception.message;
  return 'An unexpected server error occurred.';
}
