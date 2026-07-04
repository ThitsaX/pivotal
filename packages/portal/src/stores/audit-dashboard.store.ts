// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {reactive, readonly} from 'vue';
import {apiClient} from '../api/client';

export interface DashboardTotals {
    today:   number;
    last7d:  number;
    last30d: number;
}

export interface DashboardStateCount {
    state: string;
    count: number;
}

export interface DashboardStageCount {
    stage: string;
    count: number;
}

export interface DashboardCurrencyValue {
    currency:    string;
    totalAmount: string;   // DECIMAL kept as string to preserve precision
    txnCount:    number;
}

export interface DashboardFspCount {
    fspId: string;
    count: number;
}

export interface DashboardDailyCount {
    date:         string;   // YYYY-MM-DD (UTC)
    count:        number;
    errorCount:   number;
    disputeCount: number;
}

export interface DashboardHourlyCount {
    hour:       number;   // 0..23 (UTC)
    count:      number;
    errorCount: number;
}

export interface DashboardLatencyPoint {
    date:         string;          // YYYY-MM-DD (UTC)
    avgLatencyMs: number | null;
}

/** Mirrors `GetDashboardQuery.Output` from web-pivotal. */
export interface DashboardData {
    asOf:             string | null;
    generatedAt:      string;
    totals:           DashboardTotals;
    errorsToday:      number;
    disputesToday:    number;
    successRateToday: number | null;
    byState:          DashboardStateCount[];
    errorByStage:     DashboardStageCount[];
    valueByCurrency:  DashboardCurrencyValue[];
    topPayerFsps:     DashboardFspCount[];
    topPayeeFsps:     DashboardFspCount[];
    avgLatencyMsToday: number | null;
    dailyTrend:       DashboardDailyCount[];
    hourlyToday:      DashboardHourlyCount[];
    latencyTrend:     DashboardLatencyPoint[];
}

/** Near-real-time headline KPIs (mirrors `LiveStatsDto` from web-pivotal). */
export interface LiveStats {
    asOf:              string;
    scope:             string;
    today:             number;
    successRateToday:  number | null;
    errorsToday:       number;
    disputesToday:     number;
    avgLatencyMsToday: number | null;
}

interface AuditDashboardState {
    data:      DashboardData | null;
    loading:   boolean;
    loadError: string | null;
    live:      LiveStats | null;
}

const state = reactive<AuditDashboardState>({
    data:      null,
    loading:   false,
    loadError: null,
    live:      null,
});

const LIVE_POLL_INTERVAL_MS = 4000;
let liveTimer: ReturnType<typeof setInterval> | null = null;

function describeError(error: unknown): string {
    if (error instanceof Error && error.message.length > 0) {
        return error.message;
    }

    return 'Request failed.';
}

export const auditDashboardStore = {

    state: readonly(state),

    async load(): Promise<void> {

        state.loading = true;
        state.loadError = null;

        try {
            state.data = await apiClient.get<DashboardData>('/audit/dashboard');
        } catch (error) {
            state.loadError = describeError(error);
            state.data = null;
        } finally {
            state.loading = false;
        }
    },

    /** Fetches the live KPI snapshot once; on failure keeps the last value (rollup is the fallback). */
    async loadLive(): Promise<void> {
        try {
            state.live = await apiClient.get<LiveStats>('/audit/dashboard/live');
        } catch {
            // Swallow — the snapshot tiles keep showing; next poll may recover.
        }
    },

    /** Starts polling the live KPIs (idempotent). */
    startLivePolling(): void {
        this.stopLivePolling();
        void this.loadLive();
        liveTimer = setInterval(() => void this.loadLive(), LIVE_POLL_INTERVAL_MS);
    },

    stopLivePolling(): void {
        if (liveTimer !== null) {
            clearInterval(liveTimer);
            liveTimer = null;
        }

        state.live = null;
    },
};
