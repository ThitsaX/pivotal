import {FspiopErrors, FspiopException} from '@shared/fspiop';

export function resolveGatewayCorrelationId(
    correlationId: string | null | undefined,
    ...businessIds: Array<string | null | undefined>
): string {
    const businessId = firstNonBlank(...businessIds);

    if (businessId != null) {
        return businessId;
    }

    const traceCorrelationId = firstNonBlank(correlationId);

    if (traceCorrelationId == null) {
        throw new FspiopException(
            FspiopErrors.MISSING_MANDATORY_ELEMENT,
            'traceparent correlationId or transaction identifier is required',
        );
    }

    return traceCorrelationId;
}

function firstNonBlank(...values: Array<string | null | undefined>): string | null {
    for (const value of values) {
        const normalized = value?.trim();

        if (normalized != null && normalized.length > 0) {
            return normalized;
        }
    }

    return null;
}
