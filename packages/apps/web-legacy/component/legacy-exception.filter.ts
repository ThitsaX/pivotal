import {ArgumentsHost, Catch, ExceptionFilter, Logger} from '@nestjs/common';
import {Response} from 'express';
import {ExtensionList, FspiopException, FspiopStatusTranslator} from '@shared/fspiop';

export class LegacyErrorInformation {
    statusCode!: string;

    message!: string;

    localeMessage!: string;

    detailedDescription?: string;
}

@Catch()
export class LegacyExceptionFilter implements ExceptionFilter {

    private readonly logger = new Logger(LegacyExceptionFilter.name);

    catch(exception: unknown, host: ArgumentsHost): void {
        const response = host.switchToHttp().getResponse<Response>();

        const fspiopException = LegacyExceptionFilter.toFspiopException(exception);
        const status = FspiopStatusTranslator.toHttpStatus(fspiopException);

        if (fspiopException.originalError != null || !(exception instanceof FspiopException)) {
            this.logger.error(
                fspiopException.message,
                exception instanceof Error ? exception.stack : String(exception),
            );
        }

        response
            .status(status)
            .json(LegacyExceptionFilter.toErrorInformation(fspiopException));
    }

    private static toFspiopException(exception: unknown): FspiopException {
        return FspiopException.normalize(exception);
    }

    private static toErrorInformation(exception: FspiopException): LegacyErrorInformation {
        const errorInformation = new LegacyErrorInformation();
        errorInformation.statusCode = exception.errorDefinition.errorType.code;
        errorInformation.message = exception.message;
        errorInformation.localeMessage = exception.message;
        errorInformation.detailedDescription = LegacyExceptionFilter.toDetailedDescription(exception.extensionList);

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
}
