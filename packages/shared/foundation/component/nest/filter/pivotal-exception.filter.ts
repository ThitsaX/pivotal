import {ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger} from '@nestjs/common';
import {Response} from 'express';
import {PivotalException} from '../../../exception';
import {PivotalStatusTranslator} from '../../pivotal-status-translator';

interface PivotalErrorResponse {
    code: string;
    message: string;
}

@Catch()
export class PivotalExceptionFilter implements ExceptionFilter {

    private readonly logger = new Logger(PivotalExceptionFilter.name);

    catch(exception: unknown, host: ArgumentsHost): void {
        const response = host.switchToHttp().getResponse<Response>();

        // NestJS HttpException (guards, pipes, manually thrown UnauthorizedException/
        // NotFoundException/etc.) carries the intended HTTP status and a structured
        // {code, message} body. Forward both verbatim so callers — notably the SPA's
        // 401-driven silent refresh / redirect-to-login flow — see the real status.
        if (exception instanceof HttpException) {
            const status = exception.getStatus();
            response.status(status).json(PivotalExceptionFilter.toErrorResponseFromHttpException(exception, status));
            return;
        }

        const pivotalException = PivotalException.normalize(exception);
        const status = PivotalStatusTranslator.toHttpStatus(pivotalException);

        if (!(exception instanceof PivotalException)) {
            this.logger.error(
                pivotalException.message,
                exception instanceof Error ? exception.stack : String(exception),
            );
        }

        response
            .status(status)
            .json(PivotalExceptionFilter.toErrorResponse(pivotalException));
    }

    private static toErrorResponse(exception: PivotalException): PivotalErrorResponse {
        return {
            code: exception.code,
            message: exception.message,
        };
    }

    private static toErrorResponseFromHttpException(exception: HttpException, status: number): PivotalErrorResponse {
        const body = exception.getResponse();
        const fallbackCode = PivotalExceptionFilter.codeForHttpStatus(status);

        if (body != null && typeof body === 'object') {
            const obj = body as {code?: unknown; message?: unknown};
            const code = typeof obj.code === 'string' && obj.code.trim().length > 0 ? obj.code : fallbackCode;
            const message = typeof obj.message === 'string' && obj.message.trim().length > 0
                ? obj.message
                : exception.message;
            return {code, message};
        }

        if (typeof body === 'string' && body.trim().length > 0) {
            return {code: fallbackCode, message: body};
        }

        return {code: fallbackCode, message: exception.message};
    }

    private static codeForHttpStatus(status: number): string {
        switch (status) {
            case HttpStatus.BAD_REQUEST:           return 'BAD_REQUEST';
            case HttpStatus.UNAUTHORIZED:          return 'UNAUTHORIZED';
            case HttpStatus.FORBIDDEN:             return 'FORBIDDEN';
            case HttpStatus.NOT_FOUND:             return 'NOT_FOUND';
            case HttpStatus.CONFLICT:              return 'CONFLICT';
            case HttpStatus.UNPROCESSABLE_ENTITY:  return 'UNPROCESSABLE_ENTITY';
            case HttpStatus.SERVICE_UNAVAILABLE:   return 'SERVICE_UNAVAILABLE';
            case HttpStatus.INTERNAL_SERVER_ERROR: return 'INTERNAL_SERVER_ERROR';
            default:                               return `HTTP_${status}`;
        }
    }
}
