// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import { ArgumentsHost, BadRequestException, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { ExtensionList, FspiopException, FspiopStatusTranslator, FspiopUserMessages, ErrorMessageLanguage } from '@shared/fspiop';
import { OutboundValidationErrorResponse, isOutboundValidationErrorResponse } from './outbound-validation-error';
import { LoggableErrorResponse, formatSendMoneyErrorResponseLog } from './send-money-log';

export class OutboundErrorInformation {
    statusCode!: string;

    message!: string;

    localeMessage!: string;

    detailedDescription?: string;
}

@Catch()
export class OutboundExceptionFilter implements ExceptionFilter {

    private static readonly SEND_MONEY_PATH = '/secured/sendmoney';

    private readonly logger = new Logger(OutboundExceptionFilter.name);
    constructor(
        private readonly language: ErrorMessageLanguage = FspiopUserMessages.DEFAULT_LANGUAGE,
    ) { }
    catch(exception: unknown, host: ArgumentsHost): void {
        const http = host.switchToHttp();
        const response = http.getResponse<Response>();
        const request = http.getRequest<Request>();

        const validationError = OutboundExceptionFilter.getValidationErrorResponse(exception);

        if (validationError != null) {
            this.logSendMoneyErrorResponse(request, validationError);

            response.status(400).json(validationError);
            return;
        }

        const fspiopException = OutboundExceptionFilter.toFspiopException(exception);
        const status = FspiopStatusTranslator.toHttpStatus(fspiopException);
        const errorInformation = this.toErrorInformation(fspiopException);

        // Diagnostics only: an unexpected failure is worth a stack trace, a deliberate
        // FspiopException is not. This condition must never gate the audit log below -
        // that is what previously dropped every non-ValidationPipe error response.
        if (fspiopException.originalError != null || !(exception instanceof FspiopException)) {
            this.logger.error(
                fspiopException.message,
                exception instanceof Error ? exception.stack : String(exception),
            );
        }

        this.logSendMoneyErrorResponse(request, errorInformation);

        response
            .status(status)
            .json(errorInformation);
    }

    /**
     * Writes the Post Send Money error-response line at ERROR level, on every error path.
     *
     * Deliberately code-agnostic. The set of reachable error codes is open-ended because
     * post-send-money.handler.ts#toFspiopException adopts whatever code the peer DFSP
     * returned, so filtering on any particular code here would silently drop the rest.
     */
    private logSendMoneyErrorResponse(
        request: Request | undefined,
        errorResponse: LoggableErrorResponse,
    ): void {
        if (!OutboundExceptionFilter.isPostSendMoney(request)) {
            return;
        }

        this.logger.error(formatSendMoneyErrorResponseLog(request?.body, errorResponse));
    }

    /**
     * The filter is global, so it also sees PUT sendmoney and the dfsp-list routes.
     * Without this check their failures would be logged as Send Money lines carrying
     * undefined identifiers, polluting the exact search this log exists to serve.
     */
    private static isPostSendMoney(request: Request | undefined): boolean {
        if (request?.method !== 'POST') {
            return false;
        }

        const path = request.route?.path ?? request.path;

        return path === OutboundExceptionFilter.SEND_MONEY_PATH;
    }

    private static toFspiopException(exception: unknown): FspiopException {
        return FspiopException.normalize(exception);
    }

    private toErrorInformation(exception: FspiopException): OutboundErrorInformation {
        const code = exception.errorDefinition.errorType.code;
        const defaultMessage = FspiopUserMessages.messageFor(
            code,
            FspiopUserMessages.DEFAULT_LANGUAGE,
        );
        const localeMessage = FspiopUserMessages.messageFor(code, this.language);

        const errorInformation = new OutboundErrorInformation();
        errorInformation.statusCode = code;
        errorInformation.message = defaultMessage;
        errorInformation.localeMessage = localeMessage;
        errorInformation.detailedDescription = OutboundExceptionFilter.toDetailedDescription(exception.extensionList) ?? exception.message;

        return errorInformation;
    }

    private static toDetailedDescription(extensionList: ExtensionList | undefined): string | undefined {
        const descriptions = (extensionList?.extension ?? [])
            .map((extension) => {
                const key = extension.key?.trim();
                const value = extension.value?.trim();

                if (key == null || key.length === 0) {
                    return value;
                }

                if (value == null || value.length === 0) {
                    return key;
                }

                return `${key}: ${value}`;
            })
            .filter((value): value is string => value != null && value.length > 0);

        return descriptions.length === 0
            ? undefined
            : descriptions.join(', ');
    }

    private static getValidationErrorResponse(
        exception: unknown,
    ): OutboundValidationErrorResponse | undefined {
        if (!(exception instanceof BadRequestException)) {
            return undefined;
        }

        const exceptionResponse = exception.getResponse();

        if (!isOutboundValidationErrorResponse(exceptionResponse)) {
            return undefined;
        }

        return exceptionResponse;
    }
}
