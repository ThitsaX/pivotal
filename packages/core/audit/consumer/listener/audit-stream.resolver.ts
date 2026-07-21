// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Logger} from '@nestjs/common';
import {JetStreamManager} from 'nats';
import {parseMaxAgeMs, parseMaxBytes, resolveStreamWithLimits, UNLIMITED} from '@shared/nats';

const DEFAULT_AUDIT_STREAM_NAME = 'PIVOTAL_AUDIT';
const DEFAULT_AUDIT_STREAM_SUBJECT = 'audit.>';

// Audit events are consumed by app-auditor and written to MySQL (the system of record). Keep a
// multi-day replay buffer so a poison-message/DLQ backlog (see MOJ-1152) can still be inspected,
// then let JetStream age it out. Bounded by age, not size — a size cap with DiscardPolicy.Old
// could drop not-yet-persisted audit messages and lose transactions.
const DEFAULT_AUDIT_STREAM_MAX_AGE_MS = 48 * 60 * 60 * 1000;

const logger = new Logger('AuditStreamResolver');

const getAuditStreamName = (): string => {
    return process.env['PIVOTAL_AUDIT_STREAM_NAME'] ?? DEFAULT_AUDIT_STREAM_NAME;
};

export const resolveAuditStream = async (jsm: JetStreamManager, subject: string): Promise<string> => {
    return resolveStreamWithLimits(
        jsm,
        subject,
        {
            name: getAuditStreamName(),
            streamSubject: DEFAULT_AUDIT_STREAM_SUBJECT,
            maxAgeMs: parseMaxAgeMs(process.env['PIVOTAL_AUDIT_STREAM_MAX_AGE_MS'], DEFAULT_AUDIT_STREAM_MAX_AGE_MS),
            maxBytes: parseMaxBytes(process.env['PIVOTAL_AUDIT_STREAM_MAX_BYTES'], UNLIMITED),
        },
        logger,
    );
};
