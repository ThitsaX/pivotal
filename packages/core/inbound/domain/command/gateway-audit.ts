import {Snowflake} from '@shared/snowflake';

const SNOWFLAKE = Snowflake.get();

export function nextGatewayAuditId(): string {
    return SNOWFLAKE.nextId().toString();
}

export function resolveGatewayCorrelationId(correlationId: string | null | undefined, auditId: string): string {
    return correlationId ?? auditId;
}
