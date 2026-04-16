import {FspiopErrors, FspiopException} from '@shared/fspiop';

export function resolveGatewayCorrelationId(correlationId: string | null | undefined): string {
    if (correlationId == null || correlationId.trim().length === 0) {
        throw new FspiopException(
            FspiopErrors.MISSING_MANDATORY_ELEMENT,
            'traceparent correlationId is required',
        );
    }

    return correlationId;
}
