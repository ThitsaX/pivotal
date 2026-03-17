<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, reactive, ref} from 'vue';
import PageSizeDialog from '../../../components/PageSizeDialog.vue';
import PaginationInfoBar from '../../../components/PaginationInfoBar.vue';
import PrettyJsonViewer from '../../../components/PrettyJsonViewer.vue';
import SearchCriteriaForm from '../../../components/SearchCriteriaForm.vue';
import {
    DATE_COLUMN_KEYS,
    getCriteriaSections,
    PAGE_SIZE_OPTIONS,
} from '../../../modules/audit/helpers';
import type {
    DateTimeDisplayParts,
    PayloadKey,
    QueryResponse,
    SelectOption,
    SelectedPayload,
    ViewDefinition,
    ViewState,
} from '../../../modules/audit/types';

const props = defineProps<{
    viewDefinition: ViewDefinition;
    selectedTimeZone: string;
}>();

const DEFAULT_WEB_PIVOTAL_API_BASE_URL = `${window.location.protocol}//${window.location.hostname}:3202`;
const API_BASE_URL = (
    import.meta.env.VITE_WEB_PIVOTAL_API_BASE_URL ??
    import.meta.env.VITE_AUDIT_API_BASE_URL ??
    DEFAULT_WEB_PIVOTAL_API_BASE_URL
).replace(/\/$/, '');

const loading = ref(false);
const requestError = ref<string | null>(null);
const results = ref<QueryResponse | null>(null);
const lastRequestedUrl = ref<string>('');
const lastLoadedAt = ref<string | null>(null);
const isSearchFormVisible = ref(true);
const selectedPayload = ref<SelectedPayload | null>(null);
const isPageSizeDialogOpen = ref(false);
const copiedCellKey = ref<string | null>(null);
const lastSubmittedCriteria = ref<Record<string, string>>({});

const state = reactive<ViewState>({
    criteria: Object.fromEntries(
        props.viewDefinition.criteriaFields.map((field): [string, string] => [field.key, '']),
    ),
    page: 0,
    size: 20,
    orderColumn: props.viewDefinition.orderColumns[0]?.value ?? 'createdAt',
    orderDirection: 'DESC',
});

const criteriaSections = computed(() => {
    return getCriteriaSections(props.viewDefinition.criteriaFields);
});

const hasNoResults = computed((): boolean => {
    return results.value != null && results.value.records.length === 0;
});

const totalPages = computed((): number => {
    const totalRecords = results.value?.totalRecords ?? 0;

    return Math.max(1, Math.ceil(totalRecords / state.size));
});

const recordWindow = computed((): {start: number; end: number} => {
    const response = results.value;

    if (response == null || response.records.length === 0) {
        return {start: 0, end: 0};
    }

    const start = state.page * state.size + 1;
    const end = Math.min(start + response.records.length - 1, response.totalRecords);

    return {start, end};
});

const canGoPreviousPage = computed((): boolean => {
    return !loading.value && state.page > 0;
});

const canGoNextPage = computed((): boolean => {
    return !loading.value && state.page + 1 < totalPages.value;
});

const COPYABLE_ID_COLUMN_KEYS = new Set(['id', 'quoteId', 'transferId']);
const TIME_RANGE_MODE_KEYS = [
    {
        mode: 'createdAtMode',
        start: 'createdAtStart',
        end: 'createdAtEnd',
    },
    {
        mode: 'completedAtMode',
        start: 'completedAtStart',
        end: 'completedAtEnd',
    },
] as const;

const handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
        selectedPayload.value = null;
        isPageSizeDialogOpen.value = false;
    }
};

const padTwo = (value: number | string): string => String(value).padStart(2, '0');

const offsetMinutesForTimeZone = (date: Date, timeZone: string): number => {
    const zonePart = new Intl.DateTimeFormat('en-US', {
        timeZone,
        timeZoneName: 'shortOffset',
    }).formatToParts(date).find((part: Intl.DateTimeFormatPart): boolean => part.type === 'timeZoneName')?.value ?? 'GMT+00:00';

    const matches = zonePart.match(/GMT([+\-])(\d{1,2})(?::?(\d{2}))?/i);

    if (!matches) {
        return 0;
    }

    const sign = matches[1] === '-' ? -1 : 1;
    const hours = Number(matches[2]);
    const minutes = Number(matches[3] ?? '0');

    return sign * (hours * 60 + minutes);
};

const zonedLocalToUtcIso = (localDateTime: string, timeZone: string): string => {
    const match = localDateTime.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/);

    if (!match) {
        return '';
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const hour = Number(match[4]);
    const minute = Number(match[5]);
    const second = Number(match[6]);

    const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second, 0);
    const offsetOne = offsetMinutesForTimeZone(new Date(utcGuess), props.selectedTimeZone);
    let utcMs = utcGuess - offsetOne * 60_000;
    const offsetTwo = offsetMinutesForTimeZone(new Date(utcMs), props.selectedTimeZone);
    utcMs = utcGuess - offsetTwo * 60_000;

    return new Date(utcMs).toISOString();
};

const formatPartsInZone = (date: Date): {year: number; month: number; day: number} => {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: props.selectedTimeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date);

    return {
        year: Number(parts.find((part: Intl.DateTimeFormatPart): boolean => part.type === 'year')?.value ?? '0'),
        month: Number(parts.find((part: Intl.DateTimeFormatPart): boolean => part.type === 'month')?.value ?? '1'),
        day: Number(parts.find((part: Intl.DateTimeFormatPart): boolean => part.type === 'day')?.value ?? '1'),
    };
};

const shiftDateByDays = (year: number, month: number, day: number, days: number): {year: number; month: number; day: number} => {
    const shifted = new Date(Date.UTC(year, month - 1, day + days));

    return {
        year: shifted.getUTCFullYear(),
        month: shifted.getUTCMonth() + 1,
        day: shifted.getUTCDate(),
    };
};

const localMidnight = (year: number, month: number, day: number): string => {
    return `${String(year).padStart(4, '0')}-${padTwo(month)}-${padTwo(day)}T00:00:00`;
};

const resolvePresetRange = (mode: string): {start: string; end: string} => {
    const now = new Date();

    if (mode === 'last24') {
        return {
            start: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
            end: now.toISOString(),
        };
    }

    if (mode === 'today') {
        const today = formatPartsInZone(now);
        const tomorrow = shiftDateByDays(today.year, today.month, today.day, 1);

        return {
            start: zonedLocalToUtcIso(localMidnight(today.year, today.month, today.day), props.selectedTimeZone),
            end: zonedLocalToUtcIso(localMidnight(tomorrow.year, tomorrow.month, tomorrow.day), props.selectedTimeZone),
        };
    }

    if (mode === 'yesterdayToday') {
        const today = formatPartsInZone(now);
        const yesterday = shiftDateByDays(today.year, today.month, today.day, -1);
        const tomorrow = shiftDateByDays(today.year, today.month, today.day, 1);

        return {
            start: zonedLocalToUtcIso(localMidnight(yesterday.year, yesterday.month, yesterday.day), props.selectedTimeZone),
            end: zonedLocalToUtcIso(localMidnight(tomorrow.year, tomorrow.month, tomorrow.day), props.selectedTimeZone),
        };
    }

    return {
        start: '',
        end: '',
    };
};

const snapshotCriteriaForQuery = (): Record<string, string> => {
    const snapshot = {...state.criteria};

    for (const field of TIME_RANGE_MODE_KEYS) {
        const mode = state.criteria[field.mode] ?? '';

        if (!mode) {
            snapshot[field.start] = '';
            snapshot[field.end] = new Date().toISOString();
            continue;
        }

        if (mode === 'custom') {
            snapshot[field.start] = state.criteria[field.start] ?? '';
            snapshot[field.end] = state.criteria[field.end] ?? '';
            continue;
        }

        const range = resolvePresetRange(mode);
        snapshot[field.start] = range.start;
        snapshot[field.end] = range.end;
    }

    return snapshot;
};

onMounted((): void => {
    window.addEventListener('keydown', handleKeyDown);
});

onBeforeUnmount((): void => {
    window.removeEventListener('keydown', handleKeyDown);
});

const toggleSearchForm = (): void => {
    isSearchFormVisible.value = !isSearchFormVisible.value;
};

const refreshResults = (): void => {
    lastSubmittedCriteria.value = snapshotCriteriaForQuery();
    void runSearch();
};

const submitSearch = (): void => {
    lastSubmittedCriteria.value = snapshotCriteriaForQuery();
    state.page = 0;
    isSearchFormVisible.value = false;
    void runSearch();
};

const openPageSizeDialog = (): void => {
    isPageSizeDialogOpen.value = true;
};

const closePageSizeDialog = (): void => {
    isPageSizeDialogOpen.value = false;
};

const applyPageSize = (size: number): void => {
    state.size = size;
    state.page = 0;
    isPageSizeDialogOpen.value = false;
    void runSearch();
};

const resetFilters = (): void => {
    for (const field of props.viewDefinition.criteriaFields) {
        state.criteria[field.key] = '';
    }

    state.criteria.createdAtMode = '';
    state.criteria.completedAtMode = '';

    state.page = 0;
    state.size = 20;
    state.orderColumn = props.viewDefinition.orderColumns[0]?.value ?? 'createdAt';
    state.orderDirection = 'DESC';

    requestError.value = null;
    results.value = null;
    lastSubmittedCriteria.value = snapshotCriteriaForQuery();
};

const toIsoString = (value: string): string | undefined => {
    const parsed = new Date(value);

    if (Number.isNaN(parsed.getTime())) {
        return undefined;
    }

    return parsed.toISOString();
};

const buildQueryParams = (criteria: Record<string, string>): URLSearchParams => {
    const params = new URLSearchParams();

    for (const field of props.viewDefinition.criteriaFields) {
        const rawValue = criteria[field.key]?.trim();

        if (!rawValue) {
            continue;
        }

        if (field.type === 'datetime') {
            const normalizedDate = toIsoString(rawValue);

            if (normalizedDate != null) {
                params.set(field.key, normalizedDate);
            }

            continue;
        }

        params.set(field.key, rawValue);
    }

    params.set('page', String(state.page));
    params.set('size', String(state.size));
    params.set('orderColumn', state.orderColumn);
    params.set('orderDirection', state.orderDirection);

    return params;
};

const runSearch = async (): Promise<void> => {
    const params = buildQueryParams(lastSubmittedCriteria.value);
    const requestUrl = `${API_BASE_URL}${props.viewDefinition.endpoint}?${params.toString()}`;

    loading.value = true;
    requestError.value = null;
    lastRequestedUrl.value = requestUrl;

    try {
        const response = await fetch(requestUrl, {
            method: 'GET',
            headers: {
                Accept: 'application/json',
            },
        });

        if (!response.ok) {
            const body = await response.text();
            throw new Error(`${response.status} ${response.statusText} ${body}`.trim());
        }

        const payload = await response.json() as QueryResponse;

        if (payload.pageRequest != null) {
            state.page = payload.pageRequest.page;
            state.size = payload.pageRequest.size;
        }

        results.value = payload;
        lastLoadedAt.value = new Date().toISOString();
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        requestError.value = message;
        results.value = null;
    } finally {
        loading.value = false;
    }
};

const formatValue = (value: unknown): string => {
    if (value == null) {
        return '-';
    }

    if (typeof value === 'boolean') {
        return value ? 'True' : 'False';
    }

    if (typeof value === 'string') {
        return value;
    }

    if (typeof value === 'number') {
        return String(value);
    }

    return JSON.stringify(value);
};

const formatDateInTimeZone = (value: string): string => {
    const parts = toDateTimeParts(value);

    if (parts == null) {
        return value;
    }

    return `${parts.date} ${parts.time} (${parts.zone})`;
};

const formatColumnValue = (record: Record<string, unknown>, columnKey: string): string => {
    const value = record[columnKey];

    if (typeof value === 'string' && DATE_COLUMN_KEYS.has(columnKey)) {
        return formatDateInTimeZone(value);
    }

    return formatValue(value);
};

const isDateColumn = (columnKey: string): boolean => {
    return DATE_COLUMN_KEYS.has(columnKey);
};

const isCopyableIdColumn = (columnKey: string): boolean => {
    return COPYABLE_ID_COLUMN_KEYS.has(columnKey);
};

const toDateTimeParts = (value: unknown): DateTimeDisplayParts | null => {
    if (typeof value !== 'string') {
        return null;
    }

    const parsed = new Date(value);

    if (Number.isNaN(parsed.getTime())) {
        return null;
    }

    const dateParts = new Intl.DateTimeFormat('en-GB', {
        timeZone: props.selectedTimeZone,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    }).formatToParts(parsed);

    const day = dateParts.find((part: Intl.DateTimeFormatPart): boolean => part.type === 'day')?.value ?? '';
    const year = dateParts.find((part: Intl.DateTimeFormatPart): boolean => part.type === 'year')?.value ?? '';

    const month = new Intl.DateTimeFormat('en-GB', {
        timeZone: props.selectedTimeZone,
        month: 'short',
    }).format(parsed);
    const date = `${day}-${month}-${year}`;

    const time = new Intl.DateTimeFormat('en-GB', {
        timeZone: props.selectedTimeZone,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    }).format(parsed);

    const zone = new Intl.DateTimeFormat('en-GB', {
        timeZone: props.selectedTimeZone,
        timeZoneName: 'short',
    }).formatToParts(parsed)
        .find((part: Intl.DateTimeFormatPart): boolean => part.type === 'timeZoneName')
        ?.value ?? props.selectedTimeZone;

    return {
        date,
        time,
        zone,
    };
};

const getDateTimeParts = (record: Record<string, unknown>, columnKey: string): DateTimeDisplayParts | null => {
    if (!isDateColumn(columnKey)) {
        return null;
    }

    return toDateTimeParts(record[columnKey]);
};

const copyText = async (cellKey: string, value: unknown): Promise<void> => {
    if (value == null) {
        return;
    }

    try {
        await navigator.clipboard.writeText(String(value));
        copiedCellKey.value = cellKey;
        setTimeout((): void => {
            if (copiedCellKey.value === cellKey) {
                copiedCellKey.value = null;
            }
        }, 1200);
    } catch {
        copiedCellKey.value = null;
    }
};

const recordKey = (record: Record<string, unknown>, index: number): string => {
    const id = record.id;

    if (typeof id === 'string' || typeof id === 'number') {
        return String(id);
    }

    return `${props.viewDefinition.key}-${index}`;
};

const failedFlag = (record: Record<string, unknown>): boolean => {
    return record.failed === true;
};

const getPayloadValue = (record: Record<string, unknown>, payloadKey: PayloadKey): unknown => {
    if (payloadKey === 'error') {
        return record.error ?? record.fspError;
    }

    return record[payloadKey];
};

const hasPayload = (record: Record<string, unknown>, payloadKey: PayloadKey): boolean => {
    const value = getPayloadValue(record, payloadKey);

    return value !== undefined && value !== null && value !== '';
};

const openPayloadModal = (record: Record<string, unknown>, payloadKey: PayloadKey): void => {
    const value = getPayloadValue(record, payloadKey);

    if (value === undefined || value === null || value === '') {
        return;
    }

    const payloadLabel = payloadKey === 'request'
        ? 'Request'
        : payloadKey === 'response'
            ? 'Response'
            : 'Error';

    selectedPayload.value = {
        title: `${payloadLabel} - ${formatValue(record[props.viewDefinition.primaryKey])}`,
        value,
    };
};

const closePayloadModal = (): void => {
    selectedPayload.value = null;
};

const isSortableColumn = (columnKey: string): boolean => {
    return props.viewDefinition.orderColumns.some((column: SelectOption): boolean => column.value === columnKey);
};

const sortIndicator = (columnKey: string): string => {
    if (state.orderColumn !== columnKey) {
        return '';
    }

    return state.orderDirection === 'ASC' ? '▲' : '▼';
};

const sortByColumn = (columnKey: string): void => {
    if (!isSortableColumn(columnKey)) {
        return;
    }

    if (state.orderColumn === columnKey) {
        state.orderDirection = state.orderDirection === 'ASC' ? 'DESC' : 'ASC';
    } else {
        state.orderColumn = columnKey;
        state.orderDirection = 'ASC';
    }

    void runSearch();
};

const goToPreviousPage = (): void => {
    if (!canGoPreviousPage.value) {
        return;
    }

    state.page -= 1;
    void runSearch();
};

const goToNextPage = (): void => {
    if (!canGoNextPage.value) {
        return;
    }

    state.page += 1;
    void runSearch();
};

const goToFirstPage = (): void => {
    if (loading.value || state.page === 0) {
        return;
    }

    state.page = 0;
    void runSearch();
};

const goToLastPage = (): void => {
    if (loading.value) {
        return;
    }

    const lastPage = Math.max(0, totalPages.value - 1);

    if (state.page === lastPage) {
        return;
    }

    state.page = lastPage;
    void runSearch();
};

const jumpToPage = (pageNumber: number): void => {
    if (loading.value || !Number.isFinite(pageNumber)) {
        return;
    }

    const normalizedPage = Math.min(Math.max(1, Math.trunc(pageNumber)), totalPages.value) - 1;

    if (normalizedPage === state.page) {
        return;
    }

    state.page = normalizedPage;
    void runSearch();
};
</script>

<template>
    <SearchCriteriaForm
        :sections="criteriaSections"
        :criteria="state.criteria"
        :selected-time-zone="selectedTimeZone"
        :visible="isSearchFormVisible"
        :loading="loading"
        :last-loaded-at="lastLoadedAt"
        :format-last-loaded-at="formatDateInTimeZone"
        @toggle="toggleSearchForm"
        @submit="submitSearch"
        @reset="resetFilters"
        @refresh="refreshResults"
    />

    <section
        v-if="requestError || loading || results"
        class="mt-6"
    >
        <article class="overflow-hidden border border-accent/20 bg-white shadow-[0_18px_40px_rgba(20,127,195,0.08)]">
            <div class="border-b border-accent/15 bg-[#f8fbff] px-4 py-3">
                <div class="flex flex-wrap items-center gap-3 text-sm">
                    <h3 class="mr-auto font-display text-sm font-semibold uppercase tracking-[0.08em] text-accent">
                        Search Results
                    </h3>
                    <template v-if="results && !loading">
                        <span class="rounded-full bg-accentSoft px-3 py-1 font-semibold text-accent">
                            Total: {{ results.totalRecords }}
                        </span>
                        <span class="rounded-full border border-accent/25 bg-white px-3 py-1 text-accent">
                            Time Zone: {{ selectedTimeZone }}
                        </span>
                    </template>
                </div>
            </div>

            <div class="space-y-4 p-4">
                <article v-if="requestError" class="border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    <p class="font-semibold">Search failed</p>
                    <p class="mt-1 break-all font-mono text-xs">{{ requestError }}</p>
                    <p v-if="lastRequestedUrl" class="mt-2 break-all text-xs text-rose-600">{{ lastRequestedUrl }}</p>
                </article>

                <article v-if="loading" class="space-y-3 border border-slate-200 bg-[#f7faff] p-4">
                    <div class="h-4 w-48 animate-pulse bg-slate-200" />
                    <div class="h-24 animate-pulse bg-slate-100" />
                    <div class="h-24 animate-pulse bg-slate-100" />
                </article>

                <template v-if="results && !loading">
                    <PaginationInfoBar
                        class="border border-slate-200 bg-[#fbfdff] px-3 py-3"
                        :page="state.page"
                        :total-pages="totalPages"
                        :record-start="recordWindow.start"
                        :record-end="recordWindow.end"
                        :page-size="state.size"
                        :can-go-previous-page="canGoPreviousPage"
                        :can-go-next-page="canGoNextPage"
                        @open-page-size="openPageSizeDialog"
                        @first-page="goToFirstPage"
                        @previous-page="goToPreviousPage"
                        @next-page="goToNextPage"
                        @last-page="goToLastPage"
                        @jump-page="jumpToPage"
                    />

                    <article v-if="hasNoResults" class="border border-slate-200 bg-[#f7faff] p-8 text-center text-sm text-muted">
                        No records matched the current criteria.
                    </article>

                    <article v-else class="overflow-hidden border border-slate-200 bg-[#fbfdff]">
                        <div class="overflow-x-auto">
                            <table class="min-w-full text-[12px] leading-5">
                                <thead class="bg-slate-100/85 text-[11px] uppercase tracking-[0.08em] text-muted">
                                    <tr>
                                        <th
                                            v-for="column in viewDefinition.columns"
                                            :key="column.key"
                                            class="whitespace-nowrap px-3 py-2 text-left font-semibold"
                                        >
                                            <button
                                                type="button"
                                                class="inline-flex items-center gap-1 rounded px-1 py-0.5 uppercase transition hover:bg-slate-200/70 hover:text-ink"
                                                :disabled="!isSortableColumn(column.key)"
                                                @click="sortByColumn(column.key)"
                                            >
                                                <span>{{ column.label.toUpperCase() }}</span>
                                                <span class="text-[10px]">{{ sortIndicator(column.key) }}</span>
                                            </button>
                                        </th>
                                        <th class="whitespace-nowrap px-3 py-2 text-left font-semibold uppercase">
                                            JSON
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr
                                        v-for="(record, index) in results.records"
                                        :key="recordKey(record, index)"
                                        class="border-t border-slate-200/80 align-top"
                                    >
                                        <td
                                            v-for="column in viewDefinition.columns"
                                            :key="column.key"
                                            :class="[
                                                'px-3 py-2.5 text-ink',
                                                isCopyableIdColumn(column.key) ? 'max-w-none whitespace-nowrap break-normal' : 'max-w-[220px]',
                                            ]"
                                        >
                                            <span
                                                v-if="column.key === 'failed'"
                                                :class="[
                                                    'inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.05em]',
                                                    failedFlag(record)
                                                        ? 'bg-rose-100 text-rose-700'
                                                        : 'bg-emerald-100 text-emerald-700',
                                                ]"
                                            >
                                                {{ failedFlag(record) ? 'Failed' : 'Success' }}
                                            </span>
                                            <div v-else-if="isCopyableIdColumn(column.key)" class="inline-flex items-center gap-1.5 whitespace-nowrap">
                                                <span class="whitespace-nowrap font-mono text-[11px] tracking-tight">{{ formatValue(record[column.key]) }}</span>
                                                <button
                                                    type="button"
                                                    class="inline-flex h-5 w-5 items-center justify-center rounded text-[11px] text-slate-500 transition hover:bg-slate-100 hover:text-accent"
                                                    :title="copiedCellKey === `${recordKey(record, index)}-${column.key}` ? 'Copied' : `Copy ${column.label}`"
                                                    @click="copyText(`${recordKey(record, index)}-${column.key}`, record[column.key])"
                                                >
                                                    <span v-if="copiedCellKey === `${recordKey(record, index)}-${column.key}`">✓</span>
                                                    <svg
                                                        v-else
                                                        class="h-3.5 w-3.5"
                                                        viewBox="0 0 24 24"
                                                        fill="none"
                                                        stroke="currentColor"
                                                        stroke-width="2"
                                                        stroke-linecap="round"
                                                        stroke-linejoin="round"
                                                        aria-hidden="true"
                                                    >
                                                        <rect x="9" y="9" width="11" height="11" rx="2" ry="2" />
                                                        <path d="M5 15V5a2 2 0 0 1 2-2h10" />
                                                    </svg>
                                                </button>
                                            </div>
                                            <div v-else-if="isDateColumn(column.key) && getDateTimeParts(record, column.key)" class="space-y-0.5 whitespace-nowrap">
                                                <p class="text-[12px] font-semibold leading-4 text-ink">
                                                    {{ getDateTimeParts(record, column.key)?.date }}
                                                </p>
                                                <p class="font-mono text-[11px] leading-4 text-slate-600">
                                                    {{ getDateTimeParts(record, column.key)?.time }}
                                                </p>
                                                <span class="inline-flex rounded-md border border-accent/25 bg-accentSoft px-2 py-0.5 text-[10px] font-semibold text-accent">
                                                    {{ getDateTimeParts(record, column.key)?.zone }}
                                                </span>
                                            </div>
                                            <span v-else class="break-all">{{ formatColumnValue(record, column.key) }}</span>
                                        </td>
                                        <td class="whitespace-nowrap px-3 py-2.5">
                                            <div class="flex flex-wrap gap-2">
                                                <button
                                                    type="button"
                                                    class="rounded-lg border border-slate-300 bg-[#f8fbff] px-2 py-1 text-[11px] font-semibold text-slate-700 transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
                                                    :disabled="!hasPayload(record, 'request')"
                                                    @click="openPayloadModal(record, 'request')"
                                                >
                                                    Request
                                                </button>
                                                <button
                                                    type="button"
                                                    class="rounded-lg border border-slate-300 bg-[#f8fbff] px-2 py-1 text-[11px] font-semibold text-slate-700 transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
                                                    :disabled="!hasPayload(record, 'response')"
                                                    @click="openPayloadModal(record, 'response')"
                                                >
                                                    Response
                                                </button>
                                                <button
                                                    type="button"
                                                    class="rounded-lg border border-slate-300 bg-[#f8fbff] px-2 py-1 text-[11px] font-semibold text-slate-700 transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
                                                    :disabled="!hasPayload(record, 'error')"
                                                    @click="openPayloadModal(record, 'error')"
                                                >
                                                    Error
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        <div class="border-t border-slate-200 px-3 py-3">
                            <PaginationInfoBar
                                :page="state.page"
                                :total-pages="totalPages"
                                :record-start="recordWindow.start"
                                :record-end="recordWindow.end"
                                :page-size="state.size"
                                :can-go-previous-page="canGoPreviousPage"
                                :can-go-next-page="canGoNextPage"
                                @open-page-size="openPageSizeDialog"
                                @first-page="goToFirstPage"
                                @previous-page="goToPreviousPage"
                                @next-page="goToNextPage"
                                @last-page="goToLastPage"
                                @jump-page="jumpToPage"
                            />
                        </div>
                    </article>
                </template>
            </div>
        </article>
    </section>

    <PageSizeDialog
        :open="isPageSizeDialogOpen"
        :page-sizes="PAGE_SIZE_OPTIONS"
        :current-size="state.size"
        @close="closePageSizeDialog"
        @select="applyPageSize"
    />

    <Teleport to="body">
        <div
            v-if="selectedPayload"
            class="fixed inset-0 z-[80] flex items-center justify-center p-4"
        >
            <div class="absolute inset-0 bg-slate-950/45" @click="closePayloadModal" />
            <div class="relative w-full max-w-5xl rounded-2xl bg-[#f8fbff] p-4 shadow-soft">
                <div class="mb-3 flex items-center justify-between border-b border-slate-200 pb-3">
                    <h3 class="font-display text-lg text-ink">{{ selectedPayload.title }}</h3>
                    <button
                        type="button"
                        class="rounded-lg px-2 py-1 text-slate-500 transition hover:bg-slate-100"
                        @click="closePayloadModal"
                    >
                        ✕
                    </button>
                </div>

                <PrettyJsonViewer
                    :title="selectedPayload.title"
                    :value="selectedPayload.value"
                />
            </div>
        </div>
    </Teleport>
</template>
