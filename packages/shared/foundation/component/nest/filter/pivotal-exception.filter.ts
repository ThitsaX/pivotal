import {ArgumentsHost, Catch, ExceptionFilter, Logger} from '@nestjs/common';
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
}
