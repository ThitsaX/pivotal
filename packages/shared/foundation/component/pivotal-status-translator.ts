import {HttpStatus} from '@nestjs/common';
import {PivotalException} from '../exception';

export class PivotalStatusTranslator {

    static toHttpStatus(exception: PivotalException): HttpStatus {
        const code = exception.code.trim().toUpperCase();
        const explicitHttpStatus = PivotalStatusTranslator.toExplicitHttpStatus(code);

        if (explicitHttpStatus != null) {
            return explicitHttpStatus;
        }

        if (code.endsWith('_NOT_FOUND')) {
            return HttpStatus.NOT_FOUND;
        }

        if (code.includes('UNAUTHORIZED')) {
            return HttpStatus.UNAUTHORIZED;
        }

        if (code.includes('FORBIDDEN')) {
            return HttpStatus.FORBIDDEN;
        }

        if (code.includes('CONFLICT')) {
            return HttpStatus.CONFLICT;
        }

        if (
            code.includes('VALIDATION') ||
            code.includes('BAD_REQUEST') ||
            code.includes('INVALID') ||
            code.includes('MISSING')
        ) {
            return HttpStatus.BAD_REQUEST;
        }

        if (
            code.includes('TIMEOUT') ||
            code.includes('COMMUNICATION') ||
            code.includes('UNAVAILABLE')
        ) {
            return HttpStatus.SERVICE_UNAVAILABLE;
        }

        return HttpStatus.INTERNAL_SERVER_ERROR;
    }

    private static toExplicitHttpStatus(code: string): HttpStatus | undefined {
        const match = code.match(/(?:^|_)HTTP_(\d{3})$/);

        if (match == null) {
            return undefined;
        }

        const parsed = Number(match[1]);

        if (!Number.isInteger(parsed) || parsed < 100 || parsed > 599) {
            return undefined;
        }

        return parsed as HttpStatus;
    }
}
