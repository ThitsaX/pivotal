import { ArgumentsHost, BadRequestException, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import { Response } from 'express';
import { ExtensionList, FspiopException, FspiopStatusTranslator } from '@shared/fspiop';
import { OutboundValidationErrorResponse, isOutboundValidationErrorResponse } from './outbound-validation-error'

export class OutboundErrorInformation {
    statusCode!: string;

    message!: string;

    localeMessage!: string;

    detailedDescription?: string;
}

@Catch()
export class OutboundExceptionFilter implements ExceptionFilter {

    private readonly logger = new Logger(OutboundExceptionFilter.name);

    catch(exception: unknown, host: ArgumentsHost): void {
        const response = host.switchToHttp().getResponse<Response>();

        const validationError = OutboundExceptionFilter.getValidationErrorResponse(exception);

        if (validationError != null) {
            response
                .status(400)
                .json(validationError);

            return;
        }

        const fspiopException = OutboundExceptionFilter.toFspiopException(exception);
        const status = FspiopStatusTranslator.toHttpStatus(fspiopException);

        if (fspiopException.originalError != null || !(exception instanceof FspiopException)) {
            this.logger.error(
                fspiopException.message,
                exception instanceof Error ? exception.stack : String(exception),
            );
        }

        response
            .status(status)
            .json(OutboundExceptionFilter.toErrorInformation(fspiopException));
    }

    private static toFspiopException(exception: unknown): FspiopException {
        return FspiopException.normalize(exception);
    }

    private static toErrorInformation(exception: FspiopException): OutboundErrorInformation {
        const errorInformation = new OutboundErrorInformation();
        errorInformation.statusCode = exception.errorDefinition.errorType.code;
        errorInformation.message = exception.message;
        errorInformation.localeMessage = exception.message;
        errorInformation.detailedDescription = OutboundExceptionFilter.toDetailedDescription(exception.extensionList);

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
