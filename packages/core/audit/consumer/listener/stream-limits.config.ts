// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {parseMaxAgeMs, parseMaxBytes, StreamLimits, UNLIMITED} from '@shared/nats';

const HOUR_MS = 60 * 60 * 1000;

// PIVOTAL_FSPIOP (`fspiop.>`) is created and owned by the Java connectors. It carries transient
// request/command traffic consumed within seconds; a short age bound is what reclaims its storage.
const DEFAULT_FSPIOP_STREAM_NAME = 'PIVOTAL_FSPIOP';
const DEFAULT_FSPIOP_STREAM_SUBJECT = 'fspiop.>';
const DEFAULT_FSPIOP_STREAM_MAX_AGE_MS = 1 * HOUR_MS;

// PIVOTAL_AUDIT (`audit.>`) is Pivotal-owned; also bounded at creation by resolveAuditStream. Kept
// here too as belt-and-suspenders. 48h preserves a poison-message/DLQ replay buffer (MOJ-1152).
const DEFAULT_AUDIT_STREAM_NAME = 'PIVOTAL_AUDIT';
const DEFAULT_AUDIT_STREAM_SUBJECT = 'audit.>';
const DEFAULT_AUDIT_STREAM_MAX_AGE_MS = 48 * HOUR_MS;

const DEFAULT_ENFORCE_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Streams whose retention the enforcer keeps bounded. `streamSubject` is informational here — the
 * enforcer never creates a stream (it only tightens limits on one that already exists), so a stream
 * missing from NATS is simply skipped until its owner creates it.
 *
 * `maxBytes` defaults to unlimited on purpose: age is the safe bound. With DiscardPolicy.Old a
 * too-tight byte cap drops the OLDEST messages first, which on a not-yet-consumed backlog is silent
 * data loss — override per stream only with a deliberately generous ceiling.
 */
export const buildEnforcedStreamLimits = (): StreamLimits[] => [
    {
        name: process.env['PIVOTAL_FSPIOP_STREAM_NAME'] ?? DEFAULT_FSPIOP_STREAM_NAME,
        streamSubject: DEFAULT_FSPIOP_STREAM_SUBJECT,
        maxAgeMs: parseMaxAgeMs(process.env['PIVOTAL_FSPIOP_STREAM_MAX_AGE_MS'], DEFAULT_FSPIOP_STREAM_MAX_AGE_MS),
        maxBytes: parseMaxBytes(process.env['PIVOTAL_FSPIOP_STREAM_MAX_BYTES'], UNLIMITED),
    },
    {
        name: process.env['PIVOTAL_AUDIT_STREAM_NAME'] ?? DEFAULT_AUDIT_STREAM_NAME,
        streamSubject: DEFAULT_AUDIT_STREAM_SUBJECT,
        maxAgeMs: parseMaxAgeMs(process.env['PIVOTAL_AUDIT_STREAM_MAX_AGE_MS'], DEFAULT_AUDIT_STREAM_MAX_AGE_MS),
        maxBytes: parseMaxBytes(process.env['PIVOTAL_AUDIT_STREAM_MAX_BYTES'], UNLIMITED),
    },
];

/** How often the enforcer sweeps. Operational cadence knob; safe to tune via env. */
export const getEnforceIntervalMs = (): number =>
    parseMaxAgeMs(process.env['PIVOTAL_STREAM_LIMITS_ENFORCE_INTERVAL_MS'], DEFAULT_ENFORCE_INTERVAL_MS);
