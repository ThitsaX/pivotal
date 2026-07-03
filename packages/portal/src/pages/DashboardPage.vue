<script setup lang="ts">
import {computed, onMounted, onUnmounted} from 'vue';
import type {ApexChart, ApexFill, ApexGrid, ApexLegend, ApexOptions, ApexYAxis} from 'apexcharts';
import VueApexCharts from 'vue3-apexcharts';
import TimeZoneSelector from '../components/TimeZoneSelector.vue';
import type {MenuGroup} from '../stores/menu.store';
import {authStore} from '../stores/auth.store';
import {auditDashboardStore} from '../stores/audit-dashboard.store';

const DASHBOARD_PERMISSION = 'audit.dashboard.view';

const props = defineProps<{
    groups: MenuGroup[];
    selectedTimeZone: string;
}>();

const emit = defineEmits<{
    (event: 'update:selectedTimeZone', value: string): void;
    (event: 'openGroup', group: MenuGroup): void;
}>();

const canView = computed((): boolean => authStore.hasPermission(DASHBOARD_PERMISSION));
const scopedFspId = computed((): string | null => authStore.state.user?.fspId ?? null);

const data = computed(() => auditDashboardStore.state.data);
const loading = computed((): boolean => auditDashboardStore.state.loading);
const loadError = computed((): string | null => auditDashboardStore.state.loadError);

// Near-real-time KPIs (polled). When present, the headline tiles read from these instead of
// the 5-minute snapshot; charts always stay on the snapshot.
const live = computed(() => auditDashboardStore.state.live);

// ── palette (modern, cohesive; ApexCharts needs explicit hex) ─────────────────────
// Each hue has a lighter "…To" companion used as the gradient end for a fresher look.
const COLOR = {
    accent:      '#3b82f6', accentTo:    '#6366f1',   // blue → indigo  (volume / successful)
    committed:   '#10b981', committedTo: '#34d399',   // emerald        (committed / payee)
    aborted:     '#f43f5e', abortedTo:   '#fb7185',   // rose           (errors / failed)
    violet:      '#8b5cf6', violetTo:    '#a78bfa',   // violet          (latency)
    ink:         '#0f172a',
    axis:        '#64748b',
    grid:        '#eef2f7',
} as const;

function stateColor(state: string): string {
    switch (state) {
        case 'COMMITTED': return COLOR.committed;
        case 'ERROR':     return COLOR.aborted;
        default:          return COLOR.accent;
    }
}

/** Gradient fill for bar/column series — light, modern, slightly translucent. */
function barGradient(toColors: string[], direction: 'vertical' | 'horizontal'): ApexFill {
    return {
        type: 'gradient',
        gradient: {
            shade: 'light',
            type: direction,
            shadeIntensity: 0.2,
            gradientToColors: toColors,
            inverseColors: false,
            opacityFrom: 0.95,
            opacityTo: 0.9,
            stops: [0, 100],
        },
    };
}

// ── formatters ───────────────────────────────────────────────────────────────────
const numberFormatter = new Intl.NumberFormat('en-US');

function formatNumber(value: number): string {
    return numberFormatter.format(value);
}

function formatPercent(rate: number | null): string {
    return rate == null ? '—' : `${(rate * 100).toFixed(1)}%`;
}

function formatLatency(ms: number | null): string {
    if (ms == null) {
        return '—';
    }

    // Latency is an operational signal — sub-millisecond precision is noise. Show whole
    // milliseconds, or seconds with at most one decimal and no trailing zeros (4 s, 4.2 s).
    if (ms < 1000) {
        return `${Math.round(ms)} ms`;
    }

    return `${Number((ms / 1000).toFixed(1))} s`;
}

function formatAmount(value: string): string {
    const [intRaw, decRaw = ''] = value.split('.');
    const intPart = (intRaw || '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const dec = `${decRaw}00`.slice(0, 2);

    return `${intPart}.${dec}`;
}

function formatShortDate(iso: string): string {
    try {
        return new Intl.DateTimeFormat('en-US', {month: 'short', day: 'numeric', timeZone: 'UTC'})
            .format(new Date(`${iso}T00:00:00Z`));
    } catch {
        return iso;
    }
}

function formatTimestamp(iso: string | null): string {
    if (iso == null) {
        return 'never';
    }

    try {
        return new Intl.DateTimeFormat(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short',
            timeZone: props.selectedTimeZone,
        }).format(new Date(iso));
    } catch {
        return new Date(iso).toLocaleString();
    }
}

// ── shared chart base ──────────────────────────────────────────────────────────────
function baseChart(type: ApexChart['type'], extra: Partial<ApexChart> = {}): ApexChart {
    return {type, fontFamily: 'inherit', toolbar: {show: false}, animations: {enabled: true}, ...extra};
}

const countAxis: ApexYAxis = {
    labels: {formatter: (v: number): string => formatNumber(Math.round(v)), style: {colors: '#5a6b7f'}},
    min: 0,
};

const baseGrid: ApexGrid = {borderColor: COLOR.grid, strokeDashArray: 4};
const baseLegend: ApexLegend = {position: 'top', horizontalAlign: 'right', fontSize: '12px'};

// ── 30-day trend: successful vs failed (stacked area) ───────────────────────────────
const hasTrend = computed((): boolean => (data.value?.dailyTrend.length ?? 0) > 0);

const trendSeries = computed(() => {
    const days = data.value?.dailyTrend ?? [];
    return [
        {name: 'Successful', data: days.map((d) => Math.max(d.count - d.errorCount, 0))},
        {name: 'Failed',     data: days.map((d) => d.errorCount)},
    ];
});

const trendOptions = computed<ApexOptions>(() => ({
    chart: baseChart('area', {stacked: true}),
    colors: [COLOR.accent, COLOR.aborted],
    dataLabels: {enabled: false},
    stroke: {curve: 'smooth', width: 2.5},
    fill: {
        type: 'gradient',
        gradient: {
            shade: 'light',
            type: 'vertical',
            gradientToColors: [COLOR.accentTo, COLOR.abortedTo],
            opacityFrom: 0.55,
            opacityTo: 0.05,
            stops: [0, 95],
        },
    },
    xaxis: {
        categories: (data.value?.dailyTrend ?? []).map((d) => formatShortDate(d.date)),
        tickAmount: 7,
        axisBorder: {show: false},
        axisTicks: {show: false},
        labels: {rotate: 0, hideOverlappingLabels: true, style: {colors: COLOR.axis}},
    },
    yaxis: countAxis,
    legend: baseLegend,
    grid: baseGrid,
}));

// ── transfer state breakdown (donut) ────────────────────────────────────────────────
const hasState = computed((): boolean => (data.value?.byState.length ?? 0) > 0);

const stateSeries = computed((): number[] => (data.value?.byState ?? []).map((s) => s.count));

const stateTotal = computed((): number => stateSeries.value.reduce((sum, n) => sum + n, 0));

const stateOptions = computed<ApexOptions>(() => {
    const states = data.value?.byState ?? [];
    return {
        chart: baseChart('donut'),
        labels: states.map((s) => s.state),
        colors: states.map((s) => stateColor(s.state)),
        fill: {
            type: 'gradient',
            gradient: {
                shade: 'light',
                shadeIntensity: 0.25,
                gradientToColors: states.map((s) => (s.state === 'COMMITTED' ? COLOR.committedTo : COLOR.abortedTo)),
                stops: [0, 100],
            },
        },
        dataLabels: {
            enabled: true,
            formatter: (val: number): string => `${Number(val).toFixed(0)}%`,
            style: {fontSize: '14px', fontWeight: 700, colors: ['#fff']},
            dropShadow: {enabled: false},
        },
        stroke: {width: 2, colors: ['#ffffff']},
        legend: {position: 'bottom', fontSize: '12px', markers: {size: 6}, itemMargin: {horizontal: 8}},
        plotOptions: {
            // Smaller hole ⇒ thicker ring, so the per-slice "%" labels have room to render clearly.
            pie: {donut: {size: '52%', labels: {
                show: true,
                name: {fontSize: '12px', color: COLOR.axis},
                value: {fontSize: '22px', fontWeight: 700, color: COLOR.ink, formatter: (val: string): string => formatNumber(Number(val))},
                total: {show: true, label: 'Total', color: COLOR.axis, formatter: (): string => formatNumber(stateTotal.value)},
            }}},
        },
    };
});

// ── errors by stage (horizontal bar) ────────────────────────────────────────────────
const hasErrorStage = computed((): boolean => (data.value?.errorByStage ?? []).some((s) => s.count > 0));

const errorStageSeries = computed(() => [
    {name: 'Errors', data: (data.value?.errorByStage ?? []).map((s) => s.count)},
]);

const errorStageOptions = computed<ApexOptions>(() => ({
    chart: baseChart('bar'),
    colors: [COLOR.aborted],
    fill: barGradient([COLOR.abortedTo], 'horizontal'),
    plotOptions: {bar: {horizontal: true, borderRadius: 4, borderRadiusApplication: 'end', barHeight: '55%'}},
    dataLabels: {enabled: true, formatter: (v: number): string => formatNumber(v), style: {colors: ['#fff'], fontWeight: 700}},
    xaxis: {
        categories: (data.value?.errorByStage ?? []).map((s) => s.stage),
        labels: {formatter: (v: string): string => formatNumber(Math.round(Number(v))), style: {colors: COLOR.axis}},
    },
    yaxis: {labels: {style: {colors: COLOR.ink, fontWeight: 600}}},
    legend: {show: false},
    grid: baseGrid,
}));

// ── today by hour (stacked column) ──────────────────────────────────────────────────
const HOUR_LABELS = Array.from({length: 24}, (_unused, h) => `${String(h).padStart(2, '0')}:00`);
const hasHourly = computed((): boolean => (data.value?.hourlyToday ?? []).some((h) => h.count > 0));

const hourlySeries = computed(() => {
    const hours = data.value?.hourlyToday ?? [];
    return [
        {name: 'Successful', data: hours.map((h) => Math.max(h.count - h.errorCount, 0))},
        {name: 'Errors',     data: hours.map((h) => h.errorCount)},
    ];
});

const hourlyOptions = computed<ApexOptions>(() => ({
    chart: baseChart('bar', {stacked: true}),
    colors: [COLOR.accent, COLOR.aborted],
    fill: barGradient([COLOR.accentTo, COLOR.abortedTo], 'vertical'),
    plotOptions: {bar: {columnWidth: '58%', borderRadius: 3, borderRadiusApplication: 'end'}},
    dataLabels: {enabled: false},
    xaxis: {
        categories: HOUR_LABELS,
        tickAmount: 12,
        axisTicks: {show: false},
        labels: {rotate: 0, hideOverlappingLabels: true, style: {colors: COLOR.axis}},
    },
    yaxis: countAxis,
    legend: baseLegend,
    grid: baseGrid,
}));

// ── value by currency: compact precise table (no chart — keeps DECIMAL precision) ─────
const hasCurrency = computed((): boolean => (data.value?.valueByCurrency.length ?? 0) > 0);

// ── avg latency trend (line) ────────────────────────────────────────────────────────
const hasLatency = computed((): boolean =>
    (data.value?.latencyTrend ?? []).some((p) => p.avgLatencyMs != null));

const latencySeries = computed(() => [
    // Round to whole ms so ApexCharts never echoes a raw DECIMAL like 4000.0000 on the
    // axis/tooltip; the formatter then renders clean seconds.
    {name: 'Avg latency', data: (data.value?.latencyTrend ?? []).map((p) => (p.avgLatencyMs == null ? null : Math.round(p.avgLatencyMs)))},
]);

const latencyOptions = computed<ApexOptions>(() => ({
    chart: baseChart('area', {dropShadow: {enabled: true, top: 4, blur: 6, opacity: 0.12, color: COLOR.violet}}),
    colors: [COLOR.violet],
    stroke: {curve: 'smooth', width: 2.5},
    fill: {
        type: 'gradient',
        gradient: {shade: 'light', type: 'vertical', gradientToColors: [COLOR.violetTo], opacityFrom: 0.4, opacityTo: 0.03, stops: [0, 95]},
    },
    markers: {size: 0, hover: {size: 5}},
    dataLabels: {enabled: false},
    xaxis: {
        categories: (data.value?.latencyTrend ?? []).map((p) => formatShortDate(p.date)),
        tickAmount: 6,
        axisBorder: {show: false},
        axisTicks: {show: false},
        labels: {rotate: 0, hideOverlappingLabels: true, style: {colors: COLOR.axis}},
    },
    yaxis: {min: 0, tickAmount: 4, labels: {formatter: (v: number): string => formatLatency(v), style: {colors: COLOR.axis}}},
    legend: {show: false},
    grid: baseGrid,
    tooltip: {y: {formatter: (v: number): string => formatLatency(v)}},
}));

// ── top FSPs (horizontal bars) ──────────────────────────────────────────────────────
function fspSeries(rows: ReadonlyArray<{fspId: string; count: number}>) {
    return [{name: 'Transactions', data: rows.map((r) => r.count)}];
}

function fspOptions(rows: ReadonlyArray<{fspId: string; count: number}>, color: string, toColor: string): ApexOptions {
    return {
        chart: baseChart('bar'),
        colors: [color],
        fill: barGradient([toColor], 'horizontal'),
        plotOptions: {bar: {horizontal: true, borderRadius: 4, borderRadiusApplication: 'end', barHeight: '55%'}},
        dataLabels: {enabled: true, formatter: (v: number): string => formatNumber(v), style: {colors: ['#fff'], fontWeight: 700}},
        xaxis: {categories: rows.map((r) => r.fspId), labels: {style: {colors: COLOR.axis}}},
        yaxis: {labels: {style: {colors: COLOR.ink, fontWeight: 600}}},
        legend: {show: false},
        grid: baseGrid,
    };
}

const hasPayer = computed((): boolean => (data.value?.topPayerFsps.length ?? 0) > 0);
const hasPayee = computed((): boolean => (data.value?.topPayeeFsps.length ?? 0) > 0);
const payerSeries = computed(() => fspSeries(data.value?.topPayerFsps ?? []));
const payerOptions = computed(() => fspOptions(data.value?.topPayerFsps ?? [], COLOR.accent, COLOR.accentTo));
const payeeSeries = computed(() => fspSeries(data.value?.topPayeeFsps ?? []));
const payeeOptions = computed(() => fspOptions(data.value?.topPayeeFsps ?? [], COLOR.committed, COLOR.committedTo));

function refresh(): void {
    void auditDashboardStore.load();
}

onMounted((): void => {
    if (canView.value) {
        void auditDashboardStore.load();
        auditDashboardStore.startLivePolling();
    }
});

onUnmounted((): void => {
    auditDashboardStore.stopLivePolling();
});
</script>

<template>
    <section class="space-y-3 pt-1">
        <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex items-baseline gap-3">
                <h3 class="font-display text-xl text-ink">Dashboard</h3>
                <p class="text-xs text-slate-500">
                    <template v-if="scopedFspId">
                        FSP <span class="font-semibold text-ink">{{ scopedFspId }}</span>
                    </template>
                    <template v-else>Hub-wide · all FSPs</template>
                    <span class="text-slate-400">· UTC day boundaries</span>
                </p>
                <span
                    v-if="live"
                    class="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600"
                    title="Headline figures update in near real time"
                >
                    <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500"></span>
                    Live
                </span>
            </div>
            <div class="flex items-center gap-2">
                <button
                    v-if="canView"
                    type="button"
                    class="rounded-lg border border-accent/25 bg-white px-2.5 py-1.5 text-xs font-semibold text-accent transition hover:border-accent disabled:opacity-50"
                    :disabled="loading"
                    @click="refresh"
                >
                    {{ loading ? 'Refreshing…' : 'Refresh' }}
                </button>
                <div class="w-[10rem]">
                    <TimeZoneSelector
                        :model-value="selectedTimeZone"
                        compact
                        @update:model-value="emit('update:selectedTimeZone', $event)"
                    />
                </div>
            </div>
        </div>

        <!-- No permission -->
        <article
            v-if="!canView"
            class="border border-accent/20 bg-[#fafdff] px-5 py-6 text-sm text-slate-600 shadow-soft"
        >
            You do not have the <span class="font-mono text-ink">audit.dashboard.view</span> permission, so transaction
            statistics are not available for your account.
        </article>

        <template v-else>
            <!-- Loading -->
            <article
                v-if="loading && data === null"
                class="border border-accent/20 bg-[#fafdff] px-5 py-6 text-sm text-slate-500 shadow-soft"
            >
                Loading statistics…
            </article>

            <!-- Error -->
            <article
                v-else-if="loadError !== null"
                class="border border-rose-200 bg-rose-50 px-5 py-6 text-sm text-rose-700 shadow-soft"
            >
                Could not load statistics: {{ loadError }}
            </article>

            <template v-else-if="data !== null">
                <!-- KPI strip -->
                <div class="grid grid-cols-2 gap-2 lg:grid-cols-4">
                    <article class="border border-accent/20 bg-white px-3 py-2 shadow-soft">
                        <p class="text-[11px] font-semibold uppercase tracking-[0.1em] text-accent">Transactions Today</p>
                        <p class="font-display text-xl leading-tight text-ink">{{ formatNumber(live ? live.today : data.totals.today) }}</p>
                        <p class="text-[11px] text-slate-400">{{ formatNumber(data.totals.last7d) }} / 7d · {{ formatNumber(data.totals.last30d) }} / 30d</p>
                    </article>
                    <article class="border border-accent/20 bg-white px-3 py-2 shadow-soft">
                        <p class="text-[11px] font-semibold uppercase tracking-[0.1em] text-accent">Success Rate</p>
                        <p class="font-display text-xl leading-tight text-emerald-600">{{ formatPercent(live ? live.successRateToday : data.successRateToday) }}</p>
                        <p class="text-[11px] text-slate-400">committed ÷ total today</p>
                    </article>
                    <article class="border border-accent/20 bg-white px-3 py-2 shadow-soft">
                        <p class="text-[11px] font-semibold uppercase tracking-[0.1em] text-accent">Errors / Disputes</p>
                        <p class="font-display text-xl leading-tight text-rose-600">
                            {{ formatNumber(live ? live.errorsToday : data.errorsToday) }}<span class="text-sm text-amber-600"> / {{ formatNumber(live ? live.disputesToday : data.disputesToday) }}</span>
                        </p>
                        <p class="text-[11px] text-slate-400">errors / disputes today</p>
                    </article>
                    <article class="border border-accent/20 bg-white px-3 py-2 shadow-soft">
                        <p class="text-[11px] font-semibold uppercase tracking-[0.1em] text-accent">Avg Latency</p>
                        <p class="font-display text-xl leading-tight text-ink">{{ formatLatency(live ? live.avgLatencyMsToday : data.avgLatencyMsToday) }}</p>
                        <p class="text-[11px] text-slate-400">as of {{ formatTimestamp(live ? live.asOf : data.asOf) }}</p>
                    </article>
                </div>

                <!-- Row 1: trend + outcome -->
                <div class="grid gap-2 xl:grid-cols-3">
                    <article class="border border-accent/20 bg-white px-3 py-2 shadow-soft xl:col-span-2">
                        <p class="text-[11px] font-semibold uppercase tracking-[0.1em] text-accent">Transactions — Last 30 Days</p>
                        <div v-if="!hasTrend" class="mt-2 text-sm text-slate-500">No data for the last 30 days.</div>
                        <VueApexCharts v-else type="area" height="230" :options="trendOptions" :series="trendSeries" />
                    </article>
                    <article class="border border-accent/20 bg-white px-3 py-2 shadow-soft">
                        <p class="text-[11px] font-semibold uppercase tracking-[0.1em] text-accent">Outcome (Today)</p>
                        <div v-if="!hasState" class="mt-2 text-sm text-slate-500">No transactions today.</div>
                        <VueApexCharts v-else type="donut" height="260" :options="stateOptions" :series="stateSeries" />
                    </article>
                </div>

                <!-- Row 2: intraday + errors-by-stage + latency -->
                <div class="grid gap-2 xl:grid-cols-12">
                    <article class="border border-accent/20 bg-white px-3 py-2 shadow-soft xl:col-span-5">
                        <p class="text-[11px] font-semibold uppercase tracking-[0.1em] text-accent">Today by Hour (UTC)</p>
                        <div v-if="!hasHourly" class="mt-2 text-sm text-slate-500">No transactions today.</div>
                        <VueApexCharts v-else type="bar" height="195" :options="hourlyOptions" :series="hourlySeries" />
                    </article>
                    <article class="border border-accent/20 bg-white px-3 py-2 shadow-soft xl:col-span-3">
                        <p class="text-[11px] font-semibold uppercase tracking-[0.1em] text-accent">Errors by Stage (Today)</p>
                        <div v-if="!hasErrorStage" class="mt-2 text-sm text-slate-500">No errors today.</div>
                        <VueApexCharts v-else type="bar" height="195" :options="errorStageOptions" :series="errorStageSeries" />
                    </article>
                    <article class="border border-accent/20 bg-white px-3 py-2 shadow-soft xl:col-span-4">
                        <p class="text-[11px] font-semibold uppercase tracking-[0.1em] text-accent">Avg Latency — 30 Days</p>
                        <div v-if="!hasLatency" class="mt-2 text-sm text-slate-500">No completed transfers.</div>
                        <VueApexCharts v-else type="area" height="195" :options="latencyOptions" :series="latencySeries" />
                    </article>
                </div>

                <!-- Row 3: value + top payer + top payee -->
                <div class="grid gap-2 xl:grid-cols-3">
                    <article class="border border-accent/20 bg-white px-3 py-2 shadow-soft">
                        <p class="text-[11px] font-semibold uppercase tracking-[0.1em] text-accent">Value Transferred (Today)</p>
                        <p class="text-[10px] text-slate-400">committed &amp; disputed transfers · excludes failed</p>
                        <div v-if="!hasCurrency" class="mt-1 text-sm text-slate-500">No value moved today.</div>
                        <div v-else class="mt-1 max-h-[150px] overflow-auto">
                            <table class="w-full text-xs">
                                <thead>
                                    <tr class="text-left uppercase tracking-wide text-slate-400">
                                        <th class="pb-1 font-semibold">Currency</th>
                                        <th class="pb-1 text-right font-semibold">Amount</th>
                                        <th class="pb-1 text-right font-semibold">Count</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for="row in data.valueByCurrency" :key="row.currency" class="border-t border-slate-100">
                                        <td class="py-1 font-medium text-ink">{{ row.currency }}</td>
                                        <td class="py-1 text-right tabular-nums text-ink">{{ formatAmount(row.totalAmount) }}</td>
                                        <td class="py-1 text-right tabular-nums text-slate-500">{{ formatNumber(row.txnCount) }}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </article>
                    <article class="border border-accent/20 bg-white px-3 py-2 shadow-soft">
                        <p class="text-[11px] font-semibold uppercase tracking-[0.1em] text-accent">Top Payer FSPs (Today)</p>
                        <div v-if="!hasPayer" class="mt-2 text-sm text-slate-500">No data.</div>
                        <VueApexCharts v-else type="bar" height="160" :options="payerOptions" :series="payerSeries" />
                    </article>
                    <article class="border border-accent/20 bg-white px-3 py-2 shadow-soft">
                        <p class="text-[11px] font-semibold uppercase tracking-[0.1em] text-accent">Top Payee FSPs (Today)</p>
                        <div v-if="!hasPayee" class="mt-2 text-sm text-slate-500">No data.</div>
                        <VueApexCharts v-else type="bar" height="160" :options="payeeOptions" :series="payeeSeries" />
                    </article>
                </div>
            </template>
        </template>

        <!-- Quick access -->
        <div v-if="groups.length > 0" class="flex flex-wrap gap-1.5">
            <button
                v-for="group in groups"
                :key="`dashboard-${group.label}`"
                type="button"
                class="rounded-md border border-accent/25 bg-[#f8fbff] px-2.5 py-1 text-xs font-semibold text-accent transition hover:border-accent"
                :disabled="group.menus.length === 0"
                @click="group.menus.length > 0 && emit('openGroup', group)"
            >
                Open {{ group.label }}
            </button>
        </div>
    </section>
</template>
