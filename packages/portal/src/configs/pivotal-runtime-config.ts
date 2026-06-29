export type PivotalRuntimeConfig = {
    WEB_PIVOTAL_API_BASE_URL?: string;
    VITE_WEB_PIVOTAL_API_BASE_URL?: string;
    REPORT_DOWNLOAD_JOB_TTL_MIN?: string;
    REPORT_DOWNLOAD_READY_TTL_HOURS?: string;
    REPORT_DOWNLOAD_POLL_INTERVAL_SEC?: string;
    REPORT_DOWNLOAD_JOB_TTL_MS?: string;
    REPORT_DOWNLOAD_READY_TTL_MS?: string;
    REPORT_DOWNLOAD_POLL_INTERVAL_MS?: string;
    SIGNING_KEYS_UI_ENABLED?: string;
};

declare global {
    interface Window {
        __PIVOTAL_CONFIG__?: PivotalRuntimeConfig;
    }
}

export const getPivotalRuntimeConfig = (): PivotalRuntimeConfig => {
    return window.__PIVOTAL_CONFIG__ ?? {};
};

export const optionalEnv = (value: string | undefined): string | undefined => {
    const normalized = value?.trim();

    return normalized != null && normalized.length > 0 ? normalized : undefined;
};

export const booleanEnv = (value: unknown, fallback: boolean): boolean => {
    if (typeof value !== 'string') {
        return fallback;
    }

    const normalized = value.trim().toLowerCase();

    if (['true', '1', 'yes'].includes(normalized)) {
        return true;
    }

    if (['false', '0', 'no'].includes(normalized)) {
        return false;
    }

    return fallback;
};

const rawSigningKeysUiEnabled = getPivotalRuntimeConfig().SIGNING_KEYS_UI_ENABLED
    ?? (import.meta.env.VITE_SIGNING_KEYS_UI_ENABLED as string | undefined);

export const SIGNING_KEYS_UI_ENABLED = booleanEnv(rawSigningKeysUiEnabled, false);
