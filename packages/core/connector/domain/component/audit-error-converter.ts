// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {
    ErrorInformationObject,
    ErrorInformationResponse,
    FspiopException,
} from '@shared/fspiop';
import {FspClientException} from '../exception';

export class AuditErrorConverter {

    static toAuditError(error: unknown): ErrorInformationObject {
        try {
            FspiopException.rethrow(error);
        } catch (normalizedError) {
            return (normalizedError as FspiopException).toErrorObject();
        }
    }

    static toErrorResponse(error: ErrorInformationObject): ErrorInformationResponse {
        return {errorInformation: error.errorInformation};
    }

    static toFspError(error: unknown): string | null {
        const normalizedError = AuditErrorConverter.toFspClientException(error);

        if (normalizedError == null) {
            return null;
        }

        return normalizedError.message.trim().length > 0
            ? normalizedError.message
            : normalizedError.description;
    }

    private static toFspClientException(error: unknown): FspClientException | null {
        if (error instanceof FspClientException) {
            return error;
        }

        if (error == null || typeof error !== 'object') {
            return null;
        }

        const candidate = error as {
            name?: unknown;
            code?: unknown;
            message?: unknown;
            description?: unknown;
        };
        const name = typeof candidate.name === 'string' ? candidate.name : '';
        const code = typeof candidate.code === 'string' ? candidate.code : '';
        const message = typeof candidate.message === 'string' ? candidate.message.trim() : '';
        const description = typeof candidate.description === 'string' ? candidate.description.trim() : '';
        const looksLikeFspClientException = name === 'FspClientException'
            || code === 'FSP_CLIENT_ERROR'
            || description.length > 0;

        if (!looksLikeFspClientException) {
            return null;
        }

        return new FspClientException(
            code.length > 0 ? code : 'FSP_CLIENT_ERROR',
            message.length > 0 ? message : description,
        );
    }
}
