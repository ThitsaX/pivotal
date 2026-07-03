// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {ArgumentsHost, Catch, ExceptionFilter, Logger} from '@nestjs/common';
import {Response} from 'express';
import {ErrorInformationResponse} from '../../../dto/error-information-response';
import {FspiopException} from '../../../exception/fspiop-exception';
import {FspiopStatusTranslator} from '../../fspiop-status-translator';

/**
 * Global exception filter — the NestJS equivalent of Spring's @ControllerAdvice.
 *
 * Catches every unhandled exception from guards, interceptors and controllers:
 *
 *   FspiopException → translated to the correct HTTP status via FspiopStatusTranslator
 *                     and responded as an FSPIOP ErrorInformationResponse body.
 *
 *   Any other Error → wrapped in a FspiopException(INTERNAL_SERVER_ERROR) using
 *                     the original error message, then handled the same way.
 *
 * Registration — globally (recommended):
 *   app.useGlobalFilters(new FspiopExceptionFilter());
 *
 * Registration — per module (allows DI):
 *   @Module({ providers: [{ provide: APP_FILTER, useClass: FspiopExceptionFilter }] })
 */
@Catch()
export class FspiopExceptionFilter implements ExceptionFilter {

    private readonly logger = new Logger(FspiopExceptionFilter.name);

    catch(exception: unknown, host: ArgumentsHost): void {
        const response = host.switchToHttp().getResponse<Response>();

        const fspiopException = FspiopExceptionFilter.toFspiopException(exception);
        const status          = FspiopStatusTranslator.toHttpStatus(fspiopException);

        if (fspiopException.originalError != null || !(exception instanceof FspiopException)) {
            // Log unexpected errors with full stack for observability
            this.logger.error(
                fspiopException.message,
                exception instanceof Error ? exception.stack : String(exception),
            );
        }

        response
            .status(status)
            .json(FspiopExceptionFilter.toErrorResponse(fspiopException));
    }

    private static toFspiopException(exception: unknown): FspiopException {
        return FspiopException.normalize(exception);
    }

    private static toErrorResponse(exception: FspiopException): ErrorInformationResponse {
        const response = new ErrorInformationResponse();
        response.errorInformation = exception.toErrorObject().errorInformation;
        return response;
    }
}
