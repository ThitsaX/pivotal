<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, reactive, ref} from 'vue';
import PageSizeDialog from '../../components/PageSizeDialog.vue';
import PaginationInfoBar from '../../components/PaginationInfoBar.vue';
import PrettyJsonViewer from '../../components/PrettyJsonViewer.vue';
import SearchCriteriaForm from '../../components/SearchCriteriaForm.vue';
import StatusDialog from '../../components/StatusDialog.vue';
import TimeZoneSelector from '../../components/TimeZoneSelector.vue';
import {
    getCriteriaSections,
    PAGE_SIZE_OPTIONS,
} from '../../modules/audit/helpers';
import type {
    DateTimeDisplayParts,
    QueryResponse,
    SelectOption,
    SelectedPayload,
    ViewDefinition,
    ViewState,
} from '../../modules/audit/types';

const props = defineProps<{
    viewDefinition: ViewDefinition;
    selectedTimeZone: string;
}>();

const emit = defineEmits<{
    (event: 'update:selectedTimeZone', value: string): void;
}>();

const DEFAULT_WEB_PIVOTAL_API_BASE_URL = `${window.location.protocol}//${window.location.hostname}:3202`;
const API_BASE_URL = (
    import.meta.env.VITE_WEB_PIVOTAL_API_BASE_URL ??
    import.meta.env.VITE_AUDIT_API_BASE_URL ??
    DEFAULT_WEB_PIVOTAL_API_BASE_URL
).replace(/\/$/, '');
const MAX_SEARCH_RESULT_ROWS = 500_000;

const loading = ref(false);
const requestError = ref<string | null>(null);
const requestErrorEyebrow = ref('Search Failed');
const requestErrorTitle = ref('Audit search could not be completed');
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
    orderColumn: props.viewDefinition.orderColumns[0]?.value ?? 'transactionStartAt',
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

const TIME_RANGE_MODE_KEYS = [
    {
        mode: 'transactionStartAtMode',
        start: 'transactionStartAtStart',
        end: 'transactionStartAtEnd',
    },
    {
        mode: 'transactionCompletedAtMode',
        start: 'transactionCompletedAtStart',
        end: 'transactionCompletedAtEnd',
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
            snapshot[field.end] = '';
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

    state.criteria.transactionStartAtMode = '';
    state.criteria.transactionCompletedAtMode = '';

    state.page = 0;
    state.size = 20;
    state.orderColumn = props.viewDefinition.orderColumns[0]?.value ?? 'transactionStartAt';
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
    requestErrorEyebrow.value = 'Search Failed';
    requestErrorTitle.value = 'Audit search could not be completed';
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

        if (payload.totalRecords > MAX_SEARCH_RESULT_ROWS) {
            requestErrorEyebrow.value = 'Query Too Broad';
            requestErrorTitle.value = 'Please optimize the search query';
            requestError.value = `This search matched ${payload.totalRecords.toLocaleString()} rows. Please optimize the query before searching again because there are more than ${MAX_SEARCH_RESULT_ROWS.toLocaleString()} rows.`;
            results.value = null;
            return;
        }

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

const formatOptionalValue = (value: unknown): string => {
    if (typeof value === 'string') {
        const trimmed = value.trim();

        return trimmed.length > 0 ? trimmed : '-';
    }

    if (typeof value === 'number') {
        return String(value);
    }

    return '-';
};

const formatAmountNumber = (value: unknown): string => {
    if (typeof value === 'number') {
        if (Number.isNaN(value)) {
            return '-';
        }

        return value.toLocaleString('en-US', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 4,
        });
    }

    if (typeof value === 'string') {
        const normalized = value.trim();

        if (normalized.length === 0) {
            return '-';
        }

        const parsed = Number(normalized);

        if (Number.isNaN(parsed)) {
            return '-';
        }

        return parsed.toLocaleString('en-US', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 4,
        });
    }

    return '-';
};

const formatMoneyDisplay = (currency: unknown, amount: unknown): string => {
    if (typeof currency !== 'string' || currency.trim().length === 0) {
        return '-';
    }

    const formattedAmount = formatAmountNumber(amount);

    if (formattedAmount === '-') {
        return '-';
    }

    return `${currency} ${formattedAmount}`;
};

const toLegacyMoney = (value: unknown): {currency: unknown; amount: unknown} | null => {
    if (value == null || typeof value !== 'object') {
        return null;
    }

    const candidate = value as Record<string, unknown>;

    return {
        currency: candidate.currency,
        amount: candidate.amount,
    };
};

const getLegacyAmountDisplay = (record: Record<string, unknown>): {
    quoting: string;
    transfer: string;
} => {
    const phase = typeof record.phase === 'string' ? record.phase : null;
    const request = record.request as Record<string, unknown> | null | undefined;
    const response = record.response as Record<string, unknown> | null | undefined;
    const requestAmount = toLegacyMoney(request?.amount);
    const responseTransferAmount = toLegacyMoney(response?.transferAmount);
    const quotingFromLegacyQuote = formatMoneyDisplay(requestAmount?.currency, requestAmount?.amount);
    const transferFromLegacyResponse = formatMoneyDisplay(
        responseTransferAmount?.currency,
        responseTransferAmount?.amount,
    );
    const transferFromLegacyRequest = formatMoneyDisplay(requestAmount?.currency, requestAmount?.amount);

    if (phase === 'QUOTES') {
        return {
            quoting: quotingFromLegacyQuote,
            transfer: transferFromLegacyResponse !== '-'
                ? transferFromLegacyResponse
                : transferFromLegacyRequest,
        };
    }

    if (phase === 'TRANSFERS') {
        return {
            quoting: quotingFromLegacyQuote,
            transfer: transferFromLegacyRequest,
        };
    }

    return {
        quoting: '-',
        transfer: '-',
    };
};

const formatSubScenarioValue = (value: unknown): string | null => {
    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();

    if (!trimmed) {
        return null;
    }

    const normalized = trimmed
        .replace(/[_-]+/g, ' ')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/\s+/g, ' ')
        .trim();

    return normalized.replace(/\b([a-z])/g, (match: string): string => match.toUpperCase());
};

const getScenarioDisplay = (record: Record<string, unknown>): {scenario: string; subScenario: string | null} => {
    return {
        scenario: formatValue(record.transferType),
        subScenario: formatSubScenarioValue(record.subScenario),
    };
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

const formatDateTimeDisplay = (value: unknown): string => {
    const parts = toDateTimeParts(value);

    if (parts == null) {
        return '-';
    }

    return `${parts.date} ${parts.time} (${parts.zone})`;
};

const getPartyDisplay = (record: Record<string, unknown>, prefix: 'payer' | 'payee'): {
    fsp: string;
    idType: string;
    id: string;
    subId: string;
} => {
    return {
        fsp: formatOptionalValue(record[`${prefix}Fsp`]),
        idType: formatOptionalValue(record[`${prefix}IdType`]),
        id: formatOptionalValue(record[`${prefix}Id`]),
        subId: formatOptionalValue(record[`${prefix}SubId`]),
    };
};

const getDateTimeDisplay = (record: Record<string, unknown>): {
    startedAt: string;
    completedAt: string;
} => {
    return {
        startedAt: formatDateTimeDisplay(record.transactionStartAt),
        completedAt: formatDateTimeDisplay(record.transactionCompletedAt),
    };
};

const getAmountDisplay = (record: Record<string, unknown>): {
    quoting: string;
    transfer: string;
} => {
    const quoting = formatMoneyDisplay(record.quotingCurrency, record.quotingAmount);
    const transfer = formatMoneyDisplay(record.transferCurrency, record.transferAmount);

    if (quoting !== '-' || transfer !== '-') {
        return {
            quoting,
            transfer,
        };
    }

    const legacyDisplay = getLegacyAmountDisplay(record);

    return {
        quoting: legacyDisplay.quoting,
        transfer: legacyDisplay.transfer,
    };
};

const isTrueValue = (value: unknown): boolean => value === true;

const getStatusDisplay = (record: Record<string, unknown>): {
    statusLabel: string;
    statusClass: string;
    showDispute: boolean;
} => {
    const failed = isTrueValue(record.failed);
    const dispute = isTrueValue(record.dispute);

    return {
        statusLabel: failed ? 'FAILED' : 'SUCCESS',
        statusClass: failed
            ? 'border-red-200 bg-red-50 text-red-700'
            : 'border-emerald-200 bg-emerald-50 text-emerald-700',
        showDispute: dispute,
    };
};

const getDesktopHeaderCellClass = (columnKey: string): string => {
    switch (columnKey) {
        case 'correlationId':
            return 'w-[18rem]';
        case 'amount':
            return 'w-[10rem] text-right';
        case 'status':
            return 'w-[7rem]';
        case 'details':
            return 'w-[4.5rem] text-center';
        default:
            return '';
    }
};

const getDesktopBodyCellClass = (columnKey: string): string => {
    switch (columnKey) {
        case 'amount':
            return 'text-right';
        case 'details':
            return 'text-center';
        default:
            return '';
    }
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

const openDetailsModal = (record: Record<string, unknown>): void => {
    selectedPayload.value = {
        title: `Transaction Details - ${formatValue(record[props.viewDefinition.primaryKey])}`,
        value: record,
    };
};

const closePayloadModal = (): void => {
    selectedPayload.value = null;
};

const closeRequestErrorDialog = (): void => {
    requestError.value = null;
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
    <section class="animate-fadeSlide pt-2">
        <div class="mb-2 flex justify-end">
            <div class="w-full max-w-[13rem]">
                <TimeZoneSelector
                    :model-value="selectedTimeZone"
                    compact
                    @update:model-value="emit('update:selectedTimeZone', $event)"
                />
            </div>
        </div>

        <article class="overflow-visible border border-accent/20 bg-[#fafdff] shadow-[0_18px_40px_rgba(20,127,195,0.08)]">
            <div class="border-b border-accent/15 bg-[linear-gradient(135deg,rgba(20,127,195,0.14),rgba(255,255,255,0.95))] px-5 py-5">
                <div>
                    <p class="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
                        {{ viewDefinition.group }}
                    </p>
                    <h3 class="mt-2 font-display text-2xl text-ink">
                        {{ viewDefinition.title }}
                    </h3>
                    <p class="mt-2 max-w-3xl text-sm text-slate-600">
                        {{ viewDefinition.subtitle }}
                    </p>
                </div>
            </div>
            <div class="space-y-5 px-5 py-5">
                <SearchCriteriaForm
                    :sections="criteriaSections"
                    :criteria="state.criteria"
                    :selected-time-zone="selectedTimeZone"
                    :visible="isSearchFormVisible"
                    :loading="loading"
                    :last-loaded-at="lastLoadedAt"
                    :format-last-loaded-at="formatDateInTimeZone"
                    embedded
                    @toggle="toggleSearchForm"
                    @submit="submitSearch"
                    @reset="resetFilters"
                    @refresh="refreshResults"
                />

                <section v-if="requestError || loading || results">
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
                        <div class="hidden xl:block">
                            <table class="w-full table-fixed text-[12px] leading-5">
                                <thead class="bg-slate-100/85 text-[11px] uppercase tracking-[0.08em] text-muted">
                                    <tr>
                                        <th
                                            v-for="column in viewDefinition.columns"
                                            :key="column.key"
                                            :class="[
                                                'whitespace-nowrap px-3 py-2 text-left font-semibold',
                                                getDesktopHeaderCellClass(column.key),
                                            ]"
                                        >
                                            <button
                                                type="button"
                                                :class="[
                                                    'inline-flex items-center gap-1 rounded px-1 py-0.5 uppercase transition hover:bg-slate-200/70 hover:text-ink',
                                                    column.key === 'amount' ? 'justify-end w-full' : '',
                                                    column.key === 'details' ? 'justify-center w-full' : '',
                                                ]"
                                                :disabled="!isSortableColumn(column.key)"
                                                @click="sortByColumn(column.key)"
                                            >
                                                <span>{{ column.label.toUpperCase() }}</span>
                                                <span class="text-[10px]">{{ sortIndicator(column.key) }}</span>
                                            </button>
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
                                                'px-3 py-2.5 align-top text-ink',
                                                getDesktopBodyCellClass(column.key),
                                            ]"
                                        >
                                            <div v-if="column.key === 'correlationId'" class="inline-flex items-start gap-1.5">
                                                <span class="break-all font-mono text-[11px] tracking-tight">{{ formatValue(record.correlationId) }}</span>
                                                <button
                                                    type="button"
                                                    class="inline-flex h-5 w-5 items-center justify-center rounded text-[11px] text-slate-500 transition hover:bg-slate-100 hover:text-accent"
                                                    :title="copiedCellKey === `${recordKey(record, index)}-${column.key}` ? 'Copied' : `Copy ${column.label}`"
                                                    @click="copyText(`${recordKey(record, index)}-${column.key}`, record.correlationId)"
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
                                            <div v-else-if="column.key === 'payer'" class="space-y-1.5">
                                                <p class="font-semibold leading-4 text-ink">
                                                    {{ getPartyDisplay(record, 'payer').fsp }}
                                                </p>
                                                <p class="text-[11px] leading-4 text-slate-600">
                                                    {{ getPartyDisplay(record, 'payer').idType }} | {{ getPartyDisplay(record, 'payer').id }}
                                                </p>
                                                <p class="text-[11px] leading-4 text-slate-500">
                                                    Sub ID: {{ getPartyDisplay(record, 'payer').subId }}
                                                </p>
                                            </div>
                                            <div v-else-if="column.key === 'payee'" class="space-y-1.5">
                                                <p class="font-semibold leading-4 text-ink">
                                                    {{ getPartyDisplay(record, 'payee').fsp }}
                                                </p>
                                                <p class="text-[11px] leading-4 text-slate-600">
                                                    {{ getPartyDisplay(record, 'payee').idType }} | {{ getPartyDisplay(record, 'payee').id }}
                                                </p>
                                                <p class="text-[11px] leading-4 text-slate-500">
                                                    Sub ID: {{ getPartyDisplay(record, 'payee').subId }}
                                                </p>
                                            </div>
                                            <div v-else-if="column.key === 'transferType'" class="space-y-1">
                                                <p class="font-semibold leading-4 text-ink">
                                                    {{ getScenarioDisplay(record).scenario }}
                                                </p>
                                                <p class="break-words text-[11px] leading-4 text-slate-500">
                                                    {{ getScenarioDisplay(record).subScenario ?? '-' }}
                                                </p>
                                            </div>
                                            <div v-else-if="column.key === 'amount'" class="space-y-1.5">
                                                <div>
                                                    <p class="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                                                        Quoting
                                                    </p>
                                                    <p class="text-[11px] leading-4 text-slate-700 tabular-nums">
                                                        {{ getAmountDisplay(record).quoting }}
                                                    </p>
                                                </div>
                                                <div>
                                                    <p class="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                                                        Transfer
                                                    </p>
                                                    <p class="text-[11px] leading-4 text-slate-700 tabular-nums">
                                                        {{ getAmountDisplay(record).transfer }}
                                                    </p>
                                                </div>
                                            </div>
                                            <div v-else-if="column.key === 'status'" class="space-y-1.5">
                                                <span
                                                    :class="[
                                                        'inline-flex rounded-md border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em]',
                                                        getStatusDisplay(record).statusClass,
                                                    ]"
                                                >
                                                    {{ getStatusDisplay(record).statusLabel }}
                                                </span>
                                                <div v-if="getStatusDisplay(record).showDispute">
                                                    <span class="inline-flex rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-red-700">
                                                        Dispute
                                                    </span>
                                                </div>
                                            </div>
                                            <div v-else-if="column.key === 'transactionStartAt'" class="space-y-1.5">
                                                <div>
                                                    <p class="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                                                        Started
                                                    </p>
                                                    <p class="text-[11px] leading-4 text-slate-700">
                                                        {{ getDateTimeDisplay(record).startedAt }}
                                                    </p>
                                                </div>
                                                <div>
                                                    <p class="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                                                        Completed
                                                    </p>
                                                    <p class="text-[11px] leading-4 text-slate-700">
                                                        {{ getDateTimeDisplay(record).completedAt }}
                                                    </p>
                                                </div>
                                            </div>
                                            <div v-else-if="column.key === 'details'" class="flex justify-center xl:justify-start">
                                                <button
                                                    type="button"
                                                    class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-[#f8fbff] text-base font-semibold text-slate-700 transition hover:border-accent hover:text-accent"
                                                    title="View details"
                                                    @click="openDetailsModal(record)"
                                                >
                                                    ...
                                                </button>
                                            </div>
                                            <div v-else class="text-[11px] leading-4 text-slate-700">
                                                {{ formatValue(record[column.key]) }}
                                            </div>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <div class="space-y-3 p-3 xl:hidden">
                            <article
                                v-for="(record, index) in results.records"
                                :key="`card-${recordKey(record, index)}`"
                                class="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_10px_30px_rgba(20,127,195,0.06)]"
                            >
                                <section class="space-y-2">
                                    <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-accent">
                                        Transfer ID
                                    </p>
                                    <div class="flex items-start gap-2">
                                        <p class="min-w-0 break-all font-mono text-[12px] text-ink">
                                            {{ formatValue(record.correlationId) }}
                                        </p>
                                        <button
                                            type="button"
                                            class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-[11px] text-slate-500 transition hover:bg-slate-100 hover:text-accent"
                                            :title="copiedCellKey === `${recordKey(record, index)}-card-correlationId` ? 'Copied' : 'Copy Transfer ID'"
                                            @click="copyText(`${recordKey(record, index)}-card-correlationId`, record.correlationId)"
                                        >
                                            <span v-if="copiedCellKey === `${recordKey(record, index)}-card-correlationId`">✓</span>
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
                                </section>

                                <div class="grid gap-4 md:grid-cols-2">
                                    <section class="space-y-1.5">
                                        <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-accent">
                                            Payer
                                        </p>
                                        <p class="font-semibold text-ink">
                                            {{ getPartyDisplay(record, 'payer').fsp }}
                                        </p>
                                        <p class="text-sm text-slate-600">
                                            {{ getPartyDisplay(record, 'payer').idType }} | {{ getPartyDisplay(record, 'payer').id }}
                                        </p>
                                        <p class="text-sm text-slate-500">
                                            Sub ID: {{ getPartyDisplay(record, 'payer').subId }}
                                        </p>
                                    </section>

                                    <section class="space-y-1.5">
                                        <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-accent">
                                            Payee
                                        </p>
                                        <p class="font-semibold text-ink">
                                            {{ getPartyDisplay(record, 'payee').fsp }}
                                        </p>
                                        <p class="text-sm text-slate-600">
                                            {{ getPartyDisplay(record, 'payee').idType }} | {{ getPartyDisplay(record, 'payee').id }}
                                        </p>
                                        <p class="text-sm text-slate-500">
                                            Sub ID: {{ getPartyDisplay(record, 'payee').subId }}
                                        </p>
                                    </section>

                                    <section class="space-y-1.5">
                                        <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-accent">
                                            Scenario
                                        </p>
                                        <p class="font-semibold text-ink">
                                            {{ getScenarioDisplay(record).scenario }}
                                        </p>
                                        <p class="text-sm text-slate-500">
                                            {{ getScenarioDisplay(record).subScenario ?? '-' }}
                                        </p>
                                    </section>

                                    <section class="space-y-2">
                                        <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-accent">
                                            Amount
                                        </p>
                                        <div>
                                            <p class="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                                                Quoting
                                            </p>
                                            <p class="text-right text-sm text-slate-700 tabular-nums">
                                                {{ getAmountDisplay(record).quoting }}
                                            </p>
                                        </div>
                                        <div>
                                            <p class="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                                                Transfer
                                            </p>
                                            <p class="text-right text-sm text-slate-700 tabular-nums">
                                                {{ getAmountDisplay(record).transfer }}
                                            </p>
                                        </div>
                                    </section>

                                    <section class="space-y-2">
                                        <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-accent">
                                            Status
                                        </p>
                                        <div class="space-y-1.5">
                                            <span
                                                :class="[
                                                    'inline-flex rounded-md border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em]',
                                                    getStatusDisplay(record).statusClass,
                                                ]"
                                            >
                                                {{ getStatusDisplay(record).statusLabel }}
                                            </span>
                                            <div v-if="getStatusDisplay(record).showDispute">
                                                <span class="inline-flex rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-red-700">
                                                    Dispute
                                                </span>
                                            </div>
                                        </div>
                                    </section>

                                    <section class="space-y-2">
                                        <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-accent">
                                            Date/Time
                                        </p>
                                        <div>
                                            <p class="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                                                Started
                                            </p>
                                            <p class="text-sm text-slate-700">
                                                {{ getDateTimeDisplay(record).startedAt }}
                                            </p>
                                        </div>
                                        <div>
                                            <p class="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                                                Completed
                                            </p>
                                            <p class="text-sm text-slate-700">
                                                {{ getDateTimeDisplay(record).completedAt }}
                                            </p>
                                        </div>
                                    </section>
                                </div>

                                <div class="flex justify-end border-t border-slate-200 pt-3">
                                    <button
                                        type="button"
                                        class="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-[#f8fbff] text-base font-semibold text-slate-700 transition hover:border-accent hover:text-accent"
                                        title="View details"
                                        @click="openDetailsModal(record)"
                                    >
                                        ...
                                    </button>
                                </div>
                            </article>
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

    <StatusDialog
        :open="requestError != null"
        tone="error"
        :eyebrow="requestErrorEyebrow"
        :title="requestErrorTitle"
        :message="requestError"
        max-width-class="max-w-3xl"
        @close="closeRequestErrorDialog"
    >
        <div v-if="lastRequestedUrl" class="space-y-1">
            <p class="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                Requested URL
            </p>
            <p class="break-all font-mono text-xs text-slate-600">
                {{ lastRequestedUrl }}
            </p>
        </div>
    </StatusDialog>

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
