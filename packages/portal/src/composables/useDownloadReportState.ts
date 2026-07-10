// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {computed, onMounted, ref, watch, type ComputedRef, type Ref} from 'vue';
import {ApiError, apiClient} from '../api/client';
import {REPORT_DOWNLOAD_CONFIG} from '../configs/report-download';
import {authStore} from '../stores/auth.store';
import {toastStore} from '../stores/toast.store';

export type DownloadStatus = 'IDLE' | 'PENDING' | 'RUNNING' | 'READY' | 'FAILED';

export interface ReadyFile {
    url: string;
    fileName: string;
}

interface PersistedDownloadState {
    requestId: string;
    status: Exclude<DownloadStatus, 'IDLE'>;
    fileType: string;
    startedAt: number;
    fileUrl?: string;
    fileName?: string;
    urlFetchedAt?: number;
    failedMessage?: string;
}

interface ReportDownloadStatusResponse {
    status?: string | null;
    errorMessage?: string | null;
}

interface ReportDownloadUrlResponse {
    downloadUrl?: string | null;
    fileKey?: string | null;
    errorMessage?: string | null;
}

interface ReportDownloadState {
    downloadStatus: Ref<DownloadStatus>;
    readyFile: Ref<ReadyFile | null>;
    failedMessage: Ref<string | null>;
    initialized: boolean;
}

interface PollController {
    aborted: boolean;
}

interface UseReportDownloadStateReturn {
    downloadStatus: Ref<DownloadStatus>;
    isDownloading: ComputedRef<boolean>;
    readyFile: Ref<ReadyFile | null>;
    failedMessage: Ref<string | null>;
    startPolling: (requestId: string, fileType: string) => void;
    consumeDownload: () => Promise<void>;
    clearDownloadState: () => void;
}

const STORAGE_KEY_PREFIX = 'report_download:';
const JOB_TTL_MS = REPORT_DOWNLOAD_CONFIG.JOB_TTL_MS;
const READY_TTL_MS = REPORT_DOWNLOAD_CONFIG.READY_TTL_MS;
const POLL_INTERVAL_MS = REPORT_DOWNLOAD_CONFIG.POLL_INTERVAL_MS;

const reportStates = new Map<string, ReportDownloadState>();
const pollControllers = new Map<string, PollController>();
let lastUserKey = '';

const delay = (ms: number): Promise<void> => new Promise((resolve): void => {
    setTimeout(resolve, ms);
});

const formatReportName = (reportName: string): string => {
    return reportName
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
        .trim();
};

const notifyDownloadReady = (reportName: string): void => {
    toastStore.show({
        id: `${currentUserKey()}:${reportName}:ready`,
        tone: 'success',
        message: `Your ${formatReportName(reportName)} is ready.`,
        durationMs: 5000,
    });
};

const notifyDownloadFailed = (reportName: string, message: string): void => {
    toastStore.show({
        id: `${currentUserKey()}:${reportName}:failed`,
        tone: 'error',
        message,
        durationMs: 10000,
    });
};

const defaultFileName = (reportName: string, fileType: string): string => {
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');

    return `${reportName}-${stamp}.${fileType}`;
};

const currentUserKey = (): string => authStore.state.user?.id ?? authStore.state.user?.email ?? '';

const readStorageByKey = (key: string): PersistedDownloadState | null => {
    if (key.length === 0) {
        return null;
    }

    try {
        const raw = localStorage.getItem(key);
        return raw == null ? null : JSON.parse(raw) as PersistedDownloadState;
    } catch {
        return null;
    }
};

const resetReportMemoryOnUserChange = (): void => {
    const userKey = currentUserKey();

    if (userKey === lastUserKey) {
        return;
    }

    pollControllers.forEach((controller): void => {
        controller.aborted = true;
    });
    pollControllers.clear();

    reportStates.forEach((state): void => {
        state.downloadStatus.value = 'IDLE';
        state.readyFile.value = null;
        state.failedMessage.value = null;
        state.initialized = false;
    });

    lastUserKey = userKey;
};

const storageKey = (reportName: string): string => {
    const userId = currentUserKey();

    return userId.length > 0 ? `${STORAGE_KEY_PREFIX}${userId}:${reportName}` : '';
};

const readStorage = (reportName: string): PersistedDownloadState | null => {
    const key = storageKey(reportName);

    if (key.length === 0) {
        return null;
    }

    try {
        const raw = localStorage.getItem(key);

        return raw == null ? null : JSON.parse(raw) as PersistedDownloadState;
    } catch {
        return null;
    }
};

const setStorage = (reportName: string, state: PersistedDownloadState): void => {
    const key = storageKey(reportName);

    if (key.length > 0) {
        localStorage.setItem(key, JSON.stringify(state));
    }
};

const patchStorage = (reportName: string, patch: Partial<PersistedDownloadState>): void => {
    const current = readStorage(reportName);

    if (current != null) {
        setStorage(reportName, {...current, ...patch});
    }
};

const clearStorage = (reportName: string): void => {
    const key = storageKey(reportName);

    if (key.length > 0) {
        localStorage.removeItem(key);
    }
};

const ensureReportState = (reportName: string): ReportDownloadState => {
    resetReportMemoryOnUserChange();

    const existing = reportStates.get(reportName);

    if (existing != null) {
        return existing;
    }

    const created: ReportDownloadState = {
        downloadStatus: ref<DownloadStatus>('IDLE'),
        readyFile: ref<ReadyFile | null>(null),
        failedMessage: ref<string | null>(null),
        initialized: false,
    };

    reportStates.set(reportName, created);
    return created;
};

const waitForVisible = async (controller: PollController): Promise<void> => {
    if (!document.hidden || controller.aborted) {
        return;
    }

    await new Promise<void>((resolve): void => {
        const handler = (): void => {
            if (!document.hidden || controller.aborted) {
                document.removeEventListener('visibilitychange', handler);
                resolve();
            }
        };

        document.addEventListener('visibilitychange', handler);
    });
};

const applyStoredState = (reportName: string, state: ReportDownloadState): PersistedDownloadState | null => {
    const stored = readStorage(reportName);

    if (stored == null) {
        state.downloadStatus.value = 'IDLE';
        state.readyFile.value = null;
        state.failedMessage.value = null;
        return null;
    }

    if (stored.status === 'READY' && stored.fileUrl != null && stored.fileName != null) {
        const readySince = stored.urlFetchedAt ?? stored.startedAt;

        if (Date.now() - readySince <= READY_TTL_MS) {
            state.downloadStatus.value = 'READY';
            state.readyFile.value = {url: stored.fileUrl, fileName: stored.fileName};
            state.failedMessage.value = null;
            return stored;
        }

        clearStorage(reportName);
        state.downloadStatus.value = 'IDLE';
        state.readyFile.value = null;
        state.failedMessage.value = null;
        return null;
    }

    if ((stored.status === 'PENDING' || stored.status === 'RUNNING') && Date.now() - stored.startedAt > JOB_TTL_MS) {
        clearStorage(reportName);
        state.downloadStatus.value = 'IDLE';
        state.readyFile.value = null;
        state.failedMessage.value = null;
        return null;
    }

    state.downloadStatus.value = stored.status;
    state.readyFile.value = null;
    state.failedMessage.value = stored.failedMessage ?? null;
    return stored;
};

const fetchReadyUrl = async (
    reportName: string,
    requestId: string,
    fileType: string,
    state: ReportDownloadState,
): Promise<void> => {
    const response = await apiClient.get<ReportDownloadUrlResponse>(`/audit/transactions/reports/${encodeURIComponent(requestId)}/download-url`);
    const url = response.downloadUrl?.trim();

    if (url == null || url.length === 0) {
        throw new Error(response.errorMessage ?? 'Download URL was empty.');
    }

    const keyBasedName = response.fileKey?.split('/').pop();
    const fileName = keyBasedName != null && keyBasedName.length > 0
        ? keyBasedName
        : defaultFileName(reportName, fileType);

    patchStorage(reportName, {
        status: 'READY',
        fileUrl: url,
        fileName,
        urlFetchedAt: Date.now(),
    });
    state.downloadStatus.value = 'READY';
    state.readyFile.value = {url, fileName};
    state.failedMessage.value = null;
    notifyDownloadReady(reportName);
};

const markFailed = async (
    reportName: string,
    requestId: string,
    fileType: string,
    state: ReportDownloadState,
    statusErrorMessage?: string | null,
): Promise<void> => {
    const generic = `Something went wrong while generating ${formatReportName(reportName)}. Please try again.`;
    const statusMessage = statusErrorMessage?.trim() ?? '';
    let message = statusMessage.length > 0 ? statusMessage : generic;

    if (message === generic) {
        try {
            const response = await apiClient.get<ReportDownloadUrlResponse>(`/audit/transactions/reports/${encodeURIComponent(requestId)}/download-url`);
            const detailed = response.errorMessage?.trim() ?? '';
            message = detailed.length > 0 ? detailed : message;
        } catch (error) {
            const fallback = error instanceof Error ? error.message.trim() : '';
            message = fallback.length > 0 ? fallback : message;
        }
    }

    setStorage(reportName, {
        requestId,
        fileType,
        status: 'FAILED',
        startedAt: Date.now(),
        failedMessage: message,
    });
    state.downloadStatus.value = 'FAILED';
    state.readyFile.value = null;
    state.failedMessage.value = message;
    notifyDownloadFailed(reportName, message);
};

const stopPolling = (reportName: string): void => {
    const existing = pollControllers.get(reportName);

    if (existing != null) {
        existing.aborted = true;
        pollControllers.delete(reportName);
    }
};

const poll = async (
    reportName: string,
    requestId: string,
    fileType: string,
    state: ReportDownloadState,
    controller: PollController,
): Promise<void> => {
    const startedAt = readStorage(reportName)?.startedAt ?? Date.now();

    while (!controller.aborted) {
        if (Date.now() - startedAt > JOB_TTL_MS) {
            clearStorage(reportName);
            state.downloadStatus.value = 'FAILED';
            state.readyFile.value = null;
            state.failedMessage.value = 'Report is taking too long. Please try again.';
            notifyDownloadFailed(reportName, state.failedMessage.value);
            pollControllers.delete(reportName);
            return;
        }

        try {
            const response = await apiClient.get<ReportDownloadStatusResponse>(`/audit/transactions/reports/${encodeURIComponent(requestId)}/status`);
            const status = String(response.status ?? '').toUpperCase();

            if (status === '' || status === 'PENDING') {
                state.downloadStatus.value = 'PENDING';
                patchStorage(reportName, {status: 'PENDING'});
                await delay(POLL_INTERVAL_MS);
                await waitForVisible(controller);
                continue;
            }

            if (status === 'RUNNING') {
                state.downloadStatus.value = 'RUNNING';
                patchStorage(reportName, {status: 'RUNNING'});
                await delay(POLL_INTERVAL_MS);
                await waitForVisible(controller);
                continue;
            }

            if (status === 'READY') {
                await fetchReadyUrl(reportName, requestId, fileType, state);
                pollControllers.delete(reportName);
                return;
            }

            if (status === 'FAILED') {
                await markFailed(reportName, requestId, fileType, state, response.errorMessage ?? null);
                pollControllers.delete(reportName);
                return;
            }

            throw new Error(`Unexpected report status: ${status || '(empty)'}`);
        } catch (error) {
            clearStorage(reportName);
            state.downloadStatus.value = 'FAILED';
            state.readyFile.value = null;
            state.failedMessage.value = error instanceof Error ? error.message : String(error);
            notifyDownloadFailed(reportName, state.failedMessage.value);
            pollControllers.delete(reportName);
            return;
        }
    }
};

const startGlobalPolling = (reportName: string, requestId: string, fileType: string): void => {
    resetReportMemoryOnUserChange();

    const state = ensureReportState(reportName);

    stopPolling(reportName);

    const controller = {aborted: false};
    pollControllers.set(reportName, controller);

    setStorage(reportName, {
        requestId,
        fileType,
        status: 'PENDING',
        startedAt: Date.now(),
    });
    state.downloadStatus.value = 'PENDING';
    state.readyFile.value = null;
    state.failedMessage.value = null;
    void poll(reportName, requestId, fileType, state, controller);
};

export function useReportDownloadState(reportName: string): UseReportDownloadStateReturn {
    const state = ensureReportState(reportName);
    const isDownloading = computed((): boolean => {
        return state.downloadStatus.value === 'PENDING' || state.downloadStatus.value === 'RUNNING';
    });

    const initialize = (): void => {
        if (state.initialized) {
            return;
        }

        state.initialized = true;
        const stored = applyStoredState(reportName, state);

        if (stored != null && (stored.status === 'PENDING' || stored.status === 'RUNNING') && !pollControllers.has(reportName)) {
            const controller = {aborted: false};
            pollControllers.set(reportName, controller);
            void poll(reportName, stored.requestId, stored.fileType, state, controller);
        }
    };

    const consumeDownload = async (): Promise<void> => {
        const file = state.readyFile.value;

        if (file == null) {
            return;
        }

        try {
            const response = await apiClient.download(file.url).catch((error: unknown): never => {
                if (error instanceof ApiError && error.status === 403) {
                    throw new Error('The download file has expired and is no longer available. Please try again.');
                }

                throw error;
            });

            const blob = await response.blob();
            const objectUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = objectUrl;
            link.download = file.fileName;
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout((): void => URL.revokeObjectURL(objectUrl), 0);
            clearDownloadState();
        } catch (error) {
            clearDownloadState();
            state.downloadStatus.value = 'FAILED';
            state.failedMessage.value = error instanceof Error ? error.message : String(error);
        }
    };

    const clearDownloadState = (): void => {
        stopPolling(reportName);
        clearStorage(reportName);
        state.downloadStatus.value = 'IDLE';
        state.readyFile.value = null;
        state.failedMessage.value = null;
    };

    onMounted(initialize);

    watch(
        (): string => currentUserKey(),
        (): void => {
            resetReportMemoryOnUserChange();
            initialize();
        },
    );

    return {
        downloadStatus: state.downloadStatus,
        isDownloading,
        readyFile: state.readyFile,
        failedMessage: state.failedMessage,
        startPolling: (requestId: string, fileType: string): void => startGlobalPolling(reportName, requestId, fileType),
        consumeDownload,
        clearDownloadState,
    };
}

// Global resume for "poll even if user never visits the report page".
export function resumeStoredReportPolling(): void {
    resetReportMemoryOnUserChange();

    const userId = currentUserKey();

    if (userId.length === 0) {
        return;
    }

    const prefix = `${STORAGE_KEY_PREFIX}${userId}:`;

    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i) ?? '';

        if (!key.startsWith(prefix)) {
            continue;
        }

        const reportName = key.slice(prefix.length);

        if (reportName.length === 0) {
            continue;
        }

        const stored = readStorageByKey(key);

        if (stored == null) {
            continue;
        }

        const state = ensureReportState(reportName);
        applyStoredState(reportName, state);

        if (stored.status === 'READY') {
            // Show "ready" toast on login/resume as well.
            notifyDownloadReady(reportName);
            continue;
        }

        if (stored.status === 'FAILED') {
            const message = stored.failedMessage?.trim() ?? '';
            notifyDownloadFailed(
                reportName,
                message.length > 0 ? message : `Something went wrong while generating ${formatReportName(reportName)}.`,
            );
            continue;
        }

        if ((stored.status === 'PENDING' || stored.status === 'RUNNING') && !pollControllers.has(reportName)) {
            const controller = {aborted: false};
            pollControllers.set(reportName, controller);
            void poll(reportName, stored.requestId, stored.fileType, state, controller);
        }
    }
}
