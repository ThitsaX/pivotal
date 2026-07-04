// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
type RuntimeConfig = {
    REPORT_DOWNLOAD_JOB_TTL_MIN?: string;
    REPORT_DOWNLOAD_READY_TTL_HOURS?: string;
    REPORT_DOWNLOAD_POLL_INTERVAL_SEC?: string;
    // Backward compatible (ms) keys.
    REPORT_DOWNLOAD_JOB_TTL_MS?: string;
    REPORT_DOWNLOAD_READY_TTL_MS?: string;
    REPORT_DOWNLOAD_POLL_INTERVAL_MS?: string;
};

const runtimeConfig = (): RuntimeConfig => {
    return ((window as unknown as {__PIVOTAL_CONFIG__?: unknown}).__PIVOTAL_CONFIG__ ?? {}) as RuntimeConfig;
};

const toNumber = (value: unknown, fallback: number): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const toPositiveInt = (value: unknown, fallback: number): number => {
    const parsed = Math.floor(toNumber(value, fallback));
    return parsed > 0 ? parsed : fallback;
};

// Readable variables first (Vite envs are strings). Runtime (Docker) values are also strings.
const JOB_TTL_MIN = toPositiveInt(
    runtimeConfig().REPORT_DOWNLOAD_JOB_TTL_MIN ?? (import.meta.env.VITE_JOB_TTL_MIN as string | undefined),
    15,
);
const READY_TTL_HOURS = toPositiveInt(
    runtimeConfig().REPORT_DOWNLOAD_READY_TTL_HOURS ?? (import.meta.env.VITE_READY_TTL_HOURS as string | undefined),
    24,
);
const POLL_INTERVAL_SEC = toPositiveInt(
    runtimeConfig().REPORT_DOWNLOAD_POLL_INTERVAL_SEC ?? (import.meta.env.VITE_POLL_INTERVAL_SEC as string | undefined),
    30,
);

// Backward compatible ms values (if provided, they override the derived numbers).
const JOB_TTL_MS = toPositiveInt(
    runtimeConfig().REPORT_DOWNLOAD_JOB_TTL_MS ?? (import.meta.env.VITE_REPORT_DOWNLOAD_JOB_TTL_MS as string | undefined),
    JOB_TTL_MIN * 60 * 1000,
);
const READY_TTL_MS = toPositiveInt(
    runtimeConfig().REPORT_DOWNLOAD_READY_TTL_MS ?? (import.meta.env.VITE_REPORT_DOWNLOAD_READY_TTL_MS as string | undefined),
    READY_TTL_HOURS * 60 * 60 * 1000,
);
const POLL_INTERVAL_MS = toPositiveInt(
    runtimeConfig().REPORT_DOWNLOAD_POLL_INTERVAL_MS ?? (import.meta.env.VITE_REPORT_DOWNLOAD_POLL_INTERVAL_MS as string | undefined),
    POLL_INTERVAL_SEC * 1000,
);

export const REPORT_DOWNLOAD_CONFIG = {
    JOB_TTL_MIN,
    READY_TTL_HOURS,
    POLL_INTERVAL_SEC,
    JOB_TTL_MS,
    READY_TTL_MS,
    POLL_INTERVAL_MS,
};
