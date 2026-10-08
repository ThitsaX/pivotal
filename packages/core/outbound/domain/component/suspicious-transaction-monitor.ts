// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import { Logger } from '@nestjs/common';
import { FspiopErrors, FspiopException } from '@shared/fspiop';
import { RedisClient } from './redis-client';

/**
 * Allowlisted env tokens for {@code SUSPICIOUS_TRANSACTION_MATCHING_FIELDS}.
 * {@link SuspiciousTransactionMatchField.CURRENCY} is optional and omitted from the default list.
 */
export enum SuspiciousTransactionMatchField {
    PAYER_FSP_ID = 'payerFspId',
    PAYER_ID_VALUE = 'payerIdValue',
    PAYEE_FSP_ID = 'payeeFspId',
    PAYEE_ID_VALUE = 'payeeIdValue',
    AMOUNT = 'amount',
    CURRENCY = 'currency',
}

const DEFAULT_MATCHING_FIELDS: readonly SuspiciousTransactionMatchField[] = [
    SuspiciousTransactionMatchField.PAYER_FSP_ID,
    SuspiciousTransactionMatchField.PAYER_ID_VALUE,
    SuspiciousTransactionMatchField.PAYEE_FSP_ID,
    SuspiciousTransactionMatchField.PAYEE_ID_VALUE,
    SuspiciousTransactionMatchField.AMOUNT,
];

/**
 * Tracks repetitive outbound sendmoney patterns in Redis for a short window.
 * Matching fields are configurable via env (allowlist enum).
 *
 * Count semantics: the first `threshold` attempts in the window are allowed;
 * the next attempt (count > threshold) is rejected before Hub quote.
 *
 * Redis outages fail closed: the error propagates so acceptParty does not
 * continue to Hub without a successful check.
 */
export class SuspiciousTransactionMonitor {

    private static readonly KEY_PREFIX = 'suspicious:';

    /** Default matching fields when {@code SUSPICIOUS_TRANSACTION_MATCHING_FIELDS} is unset. */
    static readonly DEFAULT_MATCHING_FIELDS = DEFAULT_MATCHING_FIELDS;

    private readonly logger = new Logger(SuspiciousTransactionMonitor.name);

    constructor(
        private readonly redisClient: RedisClient,
        private readonly windowMs: number,
        private readonly threshold: number,
        private readonly enabled: boolean = true,
        private readonly matchingFields: readonly SuspiciousTransactionMatchField[] = DEFAULT_MATCHING_FIELDS,
    ) {
    }

    /**
     * Increments the pattern counter and rejects when the window threshold is exceeded.
     */
    async assertNotSuspicious(pattern: SuspiciousTransactionMonitor.Pattern): Promise<void> {
        if (!this.enabled || this.windowMs <= 0 || this.threshold <= 0) {
            return;
        }

        const key = SuspiciousTransactionMonitor.buildKey(pattern, this.matchingFields);
        const count = await this.redisClient.incrementWithTtl(key, this.windowMs);

        if (count <= this.threshold) {
            return;
        }

        this.logger.warn(
            `Suspicious transaction pattern rejected code=4240 key=${key} count=${count} threshold=${this.threshold} windowMs=${this.windowMs}`,
        );

        throw new FspiopException(
            FspiopErrors.SUSPICIOUS_TRANSACTION_PATTERN,
            'Suspicious repetitive transaction pattern detected within the monitoring window.',
        );
    }

    static buildKey(
        pattern: SuspiciousTransactionMonitor.Pattern,
        matchingFields: readonly SuspiciousTransactionMatchField[] = DEFAULT_MATCHING_FIELDS,
    ): string {
        const parts = matchingFields.map((field) => SuspiciousTransactionMonitor.fieldValue(pattern, field));
        return SuspiciousTransactionMonitor.KEY_PREFIX + parts.join('|');
    }

    /**
     * Parses a comma-separated env value into an ordered, de-duplicated allowlist.
     * Throws when empty or when any token is outside {@link SuspiciousTransactionMatchField}.
     */
    static parseMatchingFields(raw: string): SuspiciousTransactionMatchField[] {
        const tokens = raw
            .split(',')
            .map((token) => token.trim())
            .filter((token) => token.length > 0);

        if (tokens.length === 0) {
            throw new Error(
                'SUSPICIOUS_TRANSACTION_MATCHING_FIELDS must list at least one field '
                + `(allowed: ${Object.values(SuspiciousTransactionMatchField).join(', ')}).`,
            );
        }

        const allowed = new Set<string>(Object.values(SuspiciousTransactionMatchField));
        const seen = new Set<string>();
        const fields: SuspiciousTransactionMatchField[] = [];

        for (const token of tokens) {
            if (!allowed.has(token)) {
                throw new Error(
                    `Invalid SUSPICIOUS_TRANSACTION_MATCHING_FIELDS value '${token}'. `
                    + `Allowed: ${Object.values(SuspiciousTransactionMatchField).join(', ')}.`,
                );
            }
            if (seen.has(token)) {
                continue;
            }
            seen.add(token);
            fields.push(token as SuspiciousTransactionMatchField);
        }

        return fields;
    }

    private static fieldValue(
        pattern: SuspiciousTransactionMonitor.Pattern,
        field: SuspiciousTransactionMatchField,
    ): string {
        switch (field) {
            case SuspiciousTransactionMatchField.PAYER_FSP_ID:
                return pattern.payerFsp;
            case SuspiciousTransactionMatchField.PAYER_ID_VALUE:
                return pattern.payerId;
            case SuspiciousTransactionMatchField.PAYEE_FSP_ID:
                return pattern.payeeFsp;
            case SuspiciousTransactionMatchField.PAYEE_ID_VALUE:
                return pattern.payeeId;
            case SuspiciousTransactionMatchField.AMOUNT:
                return pattern.amount;
            case SuspiciousTransactionMatchField.CURRENCY:
                return pattern.currency;
            default: {
                const _exhaustive: never = field;
                throw new Error(`Unhandled match field: ${_exhaustive}`);
            }
        }
    }
}

export namespace SuspiciousTransactionMonitor {
    export interface Pattern {
        payerFsp: string;
        payerId: string;
        payeeFsp: string;
        payeeId: string;
        currency: string;
        amount: string;
    }
}
