<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, reactive, ref, watch} from 'vue';
import {
    useRoute,
    useRouter,
    type LocationQuery,
    type LocationQueryRaw,
    type LocationQueryValue,
} from 'vue-router';
import {apiClient} from '../../api/client';
import PageSizeDialog from '../../components/PageSizeDialog.vue';
import PaginationInfoBar from '../../components/PaginationInfoBar.vue';
import PrettyJsonViewer from '../../components/PrettyJsonViewer.vue';
import SearchCriteriaForm from '../../components/SearchCriteriaForm.vue';
import StatusDialog from '../../components/StatusDialog.vue';
import TimeZoneSelector from '../../components/TimeZoneSelector.vue';
import { useReportDownloadState } from '../../composables/useDownloadReportState';
import {
    getCriteriaSections,
    PAGE_SIZE_OPTIONS,
} from '../../modules/audit/helpers';
import type {
    CountResponse,
    CursorDirection,
    DateTimeDisplayParts,
    PageInfo,
    QueryResponse,
    SelectOption,
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

const route = useRoute();
const router = useRouter();

const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_ORDER_DIRECTION = 'DESC';
const DEFAULT_START_MODE = 'today';
const TIME_RANGE_MODE_KEYS = [
    {
        mode: 'transactionStartAtMode',
        start: 'transactionStartAtStart',
        end: 'transactionStartAtEnd',
    },
] as const;

const createInitialCriteria = (): Record<string, string> => {
    const criteria = Object.fromEntries(
        props.viewDefinition.criteriaFields.map((field): [string, string] => [field.key, '']),
    );

    for (const field of TIME_RANGE_MODE_KEYS) {
        criteria[field.mode] = DEFAULT_START_MODE;
    }

    return criteria;
};

const defaultOrderColumn = (): string => props.viewDefinition.orderColumns[0]?.value ?? 'transactionStartAt';

const loading = ref(false);
const requestError = ref<string | null>(null);
const requestErrorEyebrow = ref('Search Failed');
const requestErrorTitle = ref('Audit search could not be completed');
const results = ref<QueryResponse | null>(null);
const reportFileType = ref<'xlsx' | 'csv'>('xlsx');
const reportRequesting = ref(false);
const pageInfo = ref<PageInfo>({hasNext: false, hasPrev: false});
const totalCount = ref<CountResponse | null>(null);
const countLoading = ref(false);
const countSignature = ref<string | null>(null);
const rowStart = ref(1);
const rowStartKnown = ref(true);
const lastRequestedUrl = ref<string>('');
const lastLoadedAt = ref<string | null>(null);
const isSearchFormVisible = ref(true);
const selectedTransaction = ref<{title: string; record: Record<string, unknown>} | null>(null);
const transactionDetailsLoading = ref(false);
const transactionDetailsError = ref<string | null>(null);
const activeDetailsTab = ref<'parties' | 'quotes' | 'transfers'>('parties');
const isPageSizeDialogOpen = ref(false);
const copiedCellKey = ref<string | null>(null);
const lastSubmittedCriteria = ref<Record<string, string>>({});

const state = reactive<ViewState>({
    criteria: createInitialCriteria(),
    size: DEFAULT_PAGE_SIZE,
    orderColumn: defaultOrderColumn(),
    orderDirection: DEFAULT_ORDER_DIRECTION,
});
const {
    downloadStatus,
    isDownloading,
    readyFile,
    failedMessage,
    startPolling,
    consumeDownload,
    clearDownloadState,
} = useReportDownloadState('TransactionDetailReport');

const statusLabel: Record<string, string> = {
    PENDING: 'Queuing report...',
    RUNNING: 'Generating report...',
    READY: 'Report ready',
};

// Keyset navigation — ephemeral component state (NOT route-synced), so a hard reload
// returns the first page of the same search rather than a stale cursor offset.
const nav = reactive<{direction: CursorDirection; token: string}>({
    direction: 'first',
    token: '',
});

const criteriaSections = computed(() => {
    return getCriteriaSections(props.viewDefinition.criteriaFields);
});

const hasNoResults = computed((): boolean => {
    return results.value != null && results.value.records.length === 0;
});

const recordWindow = computed((): {start: number; end: number} => {
    const response = results.value;

    if (response == null || response.records.length === 0) {
        return {start: 0, end: 0};
    }

    return {start: rowStart.value, end: rowStart.value + response.records.length - 1};
});

const countDisplay = computed((): string => {
    const count = totalCount.value;

    if (count == null) {
        return '…';
    }

    if (count.capped) {
        return `~${count.limit.toLocaleString()}+`;
    }

    return count.count.toLocaleString();
});

const canGoPreviousPage = computed((): boolean => {
    return !loading.value && pageInfo.value.hasPrev;
});

const canGoNextPage = computed((): boolean => {
    return !loading.value && pageInfo.value.hasNext;
});

const handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
        selectedTransaction.value = null;
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

const firstQueryValue = (value: LocationQueryValue | LocationQueryValue[] | undefined): string => {
    const candidate = Array.isArray(value) ? value[0] : value;

    return candidate ?? '';
};

const queryHasValue = (query: LocationQuery, key: string): boolean => {
    return firstQueryValue(query[key]).trim().length > 0;
};

const hasSearchRouteQuery = (query: LocationQuery): boolean => {
    if (
        queryHasValue(query, 'size')
        || queryHasValue(query, 'orderColumn')
        || queryHasValue(query, 'orderDirection')
    ) {
        return true;
    }

    for (const field of props.viewDefinition.criteriaFields) {
        if (queryHasValue(query, field.key)) {
            return true;
        }
    }

    return TIME_RANGE_MODE_KEYS.some((field): boolean => queryHasValue(query, field.mode));
};

const parsePositiveInteger = (value: string, fallback: number): number => {
    const parsed = Number.parseInt(value, 10);

    if (!Number.isFinite(parsed) || parsed <= 0) {
        return fallback;
    }

    return parsed;
};

const parseOrderColumn = (value: string): string => {
    return props.viewDefinition.orderColumns.some((column: SelectOption): boolean => column.value === value)
        ? value
        : defaultOrderColumn();
};

const parseOrderDirection = (value: string): 'ASC' | 'DESC' => {
    return value === 'ASC' ? 'ASC' : 'DESC';
};

const resetCriteriaState = (): void => {
    for (const field of props.viewDefinition.criteriaFields) {
        state.criteria[field.key] = '';
    }

    for (const field of TIME_RANGE_MODE_KEYS) {
        state.criteria[field.mode] = DEFAULT_START_MODE;
    }
};

const resetPagination = (): void => {
    nav.direction = 'first';
    nav.token = '';
    rowStart.value = 1;
    rowStartKnown.value = true;
    pageInfo.value = {hasNext: false, hasPrev: false};
};

const resetSearchState = (): void => {
    resetCriteriaState();
    resetPagination();
    state.size = DEFAULT_PAGE_SIZE;
    state.orderColumn = defaultOrderColumn();
    state.orderDirection = DEFAULT_ORDER_DIRECTION;
    requestError.value = null;
    results.value = null;
    totalCount.value = null;
    countSignature.value = null;
    lastRequestedUrl.value = '';
    lastLoadedAt.value = null;
    lastSubmittedCriteria.value = {};
    isSearchFormVisible.value = true;
};

const applyRouteQueryToState = (query: LocationQuery): void => {
    resetCriteriaState();

    for (const field of props.viewDefinition.criteriaFields) {
        state.criteria[field.key] = firstQueryValue(query[field.key]).trim();
    }

    for (const field of TIME_RANGE_MODE_KEYS) {
        state.criteria[field.mode] = firstQueryValue(query[field.mode]).trim();
    }

    state.size = parsePositiveInteger(firstQueryValue(query.size), DEFAULT_PAGE_SIZE);
    state.orderColumn = parseOrderColumn(firstQueryValue(query.orderColumn));
    state.orderDirection = parseOrderDirection(firstQueryValue(query.orderDirection));
};

const appendQueryValue = (query: LocationQueryRaw, key: string, value: string | number): void => {
    const normalized = String(value).trim();

    if (normalized.length > 0) {
        query[key] = normalized;
    }
};

const buildSearchRouteQuery = (): LocationQueryRaw => {
    const query: LocationQueryRaw = {};

    for (const field of props.viewDefinition.criteriaFields) {
        appendQueryValue(query, field.key, state.criteria[field.key] ?? '');
    }

    for (const field of TIME_RANGE_MODE_KEYS) {
        appendQueryValue(query, field.mode, state.criteria[field.mode] ?? '');
    }

    appendQueryValue(query, 'size', state.size);
    appendQueryValue(query, 'orderColumn', state.orderColumn);
    appendQueryValue(query, 'orderDirection', state.orderDirection);

    return query;
};

const normalizeQueryForComparison = (query: LocationQuery | LocationQueryRaw): string => {
    const entries: Array<[string, string]> = [];

    for (const [key, value] of Object.entries(query)) {
        const values = Array.isArray(value) ? value : [value];

        for (const item of values) {
            if (item == null) {
                continue;
            }

            const normalized = String(item).trim();

            if (normalized.length > 0) {
                entries.push([key, normalized]);
            }
        }
    }

    return JSON.stringify(entries.sort(([leftKey, leftValue], [rightKey, rightValue]): number => {
        if (leftKey === rightKey) {
            return leftValue.localeCompare(rightValue);
        }

        return leftKey.localeCompare(rightKey);
    }));
};

const isSameQuery = (left: LocationQuery, right: LocationQueryRaw): boolean => {
    return normalizeQueryForComparison(left) === normalizeQueryForComparison(right);
};

const navigateToSearchRoute = (mode: 'push' | 'replace' = 'push'): void => {
    const query = buildSearchRouteQuery();

    if (isSameQuery(route.query, query)) {
        lastSubmittedCriteria.value = snapshotCriteriaForQuery();
        executeNewSearch();
        return;
    }

    const navigation = {path: route.path, query};

    if (mode === 'replace') {
        void router.replace(navigation);
        return;
    }

    void router.push(navigation);
};

const navigateToEmptySearchRoute = (): void => {
    const query: LocationQueryRaw = {};

    if (isSameQuery(route.query, query)) {
        return;
    }

    void router.push({path: route.path, query});
};

const isCurrentTransactionsRoute = (): boolean => {
    const viewPath = `/views/${props.viewDefinition.key}`;

    return route.path === viewPath || route.path.startsWith(`${viewPath}/`);
};

const applySearchRouteQuery = (query: LocationQuery): void => {
    if (!isCurrentTransactionsRoute()) {
        return;
    }

    if (!hasSearchRouteQuery(query)) {
        resetSearchState();
        return;
    }

    applyRouteQueryToState(query);
    lastSubmittedCriteria.value = snapshotCriteriaForQuery();
    isSearchFormVisible.value = false;
    executeNewSearch();
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
    navigateToSearchRoute('replace');
};

const submitSearch = (): void => {
    isSearchFormVisible.value = false;
    navigateToSearchRoute();
};

const openPageSizeDialog = (): void => {
    isPageSizeDialogOpen.value = true;
};

const closePageSizeDialog = (): void => {
    isPageSizeDialogOpen.value = false;
};

const applyPageSize = (size: number): void => {
    state.size = size;
    isPageSizeDialogOpen.value = false;
    navigateToSearchRoute();
};

const resetFilters = (): void => {
    resetSearchState();
    navigateToEmptySearchRoute();
};

const toIsoString = (value: string): string | undefined => {
    const parsed = new Date(value);

    if (Number.isNaN(parsed.getTime())) {
        return undefined;
    }

    return parsed.toISOString();
};

const buildCriteriaParams = (criteria: Record<string, string>): URLSearchParams => {
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

    return params;
};

const downloadTransactionDetailReport = async (): Promise<void> => {
    const criteria = Object.keys(lastSubmittedCriteria.value).length > 0
        ? lastSubmittedCriteria.value
        : snapshotCriteriaForQuery();
    const params = buildCriteriaParams(criteria);

    params.set('fileType', reportFileType.value);
    params.set('orderColumn', state.orderColumn);
    params.set('orderDirection', state.orderDirection);

    reportRequesting.value = true;

    try {
        const response = await apiClient.post<{
            requestId?: string;
            reqId?: string;
            reportRequestId?: string;
        }>(`/audit/transactions/reports?${params.toString()}`);

        const requestId = response.requestId ?? response.reqId ?? response.reportRequestId;
        if (typeof requestId === 'string' && requestId.length > 0) {
            startPolling(requestId, reportFileType.value);
            return;
        }

        requestErrorEyebrow.value = 'Download Failed';
        requestErrorTitle.value = 'Report request could not be created';
        requestError.value = 'Report request did not return a requestId.';
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        requestErrorEyebrow.value = 'Download Failed';
        requestErrorTitle.value = 'Report request could not be created';
        requestError.value = message;
    } finally {
        reportRequesting.value = false;
    }
};

// Fires the list + count requests for a brand-new search. The count runs in parallel and is
// cached per filter signature, so paging (First/Prev/Next/Last) and size/sort changes never
// re-count.
const executeNewSearch = (): void => {
    resetPagination();

    const signature = buildCriteriaParams(lastSubmittedCriteria.value).toString();

    if (signature !== countSignature.value) {
        countSignature.value = signature;
        void runCount();
    }

    void runSearch();
};

const runCount = async (): Promise<void> => {
    const params = buildCriteriaParams(lastSubmittedCriteria.value);
    const requestPath = `${props.viewDefinition.endpoint}/count?${params.toString()}`;

    countLoading.value = true;
    totalCount.value = null;

    try {
        totalCount.value = await apiClient.get<CountResponse>(requestPath);
    } catch {
        totalCount.value = null;
    } finally {
        countLoading.value = false;
    }
};

const runSearch = async (): Promise<void> => {
    const params = buildCriteriaParams(lastSubmittedCriteria.value);
    params.set('size', String(state.size));
    params.set('orderColumn', state.orderColumn);
    params.set('orderDirection', state.orderDirection);
    params.set('direction', nav.direction);

    if (nav.token) {
        params.set('cursor', nav.token);
    }

    const requestPath = `${props.viewDefinition.endpoint}?${params.toString()}`;
    const requestedDirection = nav.direction;

    loading.value = true;
    requestError.value = null;
    requestErrorEyebrow.value = 'Search Failed';
    requestErrorTitle.value = 'Audit search could not be completed';
    lastRequestedUrl.value = requestPath;

    try {
        const payload = await apiClient.get<QueryResponse>(requestPath);

        results.value = payload;
        pageInfo.value = payload.pageInfo ?? {hasNext: false, hasPrev: false};

        // "Showing X-Y" for the Last page needs the absolute offset, which is only known when
        // the total count is exact (not capped at MAX_LIMIT).
        if (requestedDirection === 'last') {
            const count = totalCount.value;

            if (count != null && !count.capped) {
                rowStart.value = Math.max(1, count.count - payload.records.length + 1);
                rowStartKnown.value = true;
            } else {
                rowStart.value = 1;
                rowStartKnown.value = false;
            }
        }

        lastLoadedAt.value = new Date().toISOString();
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        requestError.value = message;
        results.value = null;
    } finally {
        loading.value = false;
    }
};

watch(
    () => [route.path, route.query] as const,
    ([, query]): void => {
        applySearchRouteQuery(query);
    },
    {immediate: true},
);

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

const toDisplayDateTime = (value: unknown): {dateTime: string; zone: string; hasValue: boolean} => {
    const parts = toDateTimeParts(value);

    if (parts == null) {
        return {
            dateTime: '-',
            zone: '',
            hasValue: false,
        };
    }

    return {
        dateTime: `${parts.date} ${parts.time}`,
        zone: parts.zone,
        hasValue: true,
    };
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

const hasVisibleValue = (value: string): boolean => value.trim().length > 0 && value !== '-';

const getDateTimeDisplay = (record: Record<string, unknown>): {
    startedAt: {dateTime: string; zone: string; hasValue: boolean};
    completedAt: {dateTime: string; zone: string; hasValue: boolean};
} => {
    const startedValue = record.transactionStartAt ?? record.transactionStartedAt;
    const completedValue = record.transactionCompletedAt;

    return {
        startedAt: toDisplayDateTime(startedValue),
        completedAt: toDisplayDateTime(completedValue),
    };
};

const getDurationDisplay = (record: Record<string, unknown>): string => {
    const startValue = record.transactionStartAt ?? record.transactionStartedAt;
    const endValue = record.transactionCompletedAt;

    if (typeof startValue !== 'string' || typeof endValue !== 'string') {
        return '-';
    }

    const startAt = new Date(startValue);
    const endAt = new Date(endValue);

    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
        return '-';
    }

    const durationMs = endAt.getTime() - startAt.getTime();

    if (durationMs < 0) {
        return '-';
    }

    const totalSeconds = Math.floor(durationMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
        return `${hours}h ${minutes}m ${seconds}s`;
    }

    if (minutes > 0) {
        return `${minutes}m ${seconds}s`;
    }

    return `${seconds}s`;
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

const STATUS_BADGE_BASE_CLASS =
    'inline-flex w-[6.75rem] justify-center rounded-md border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em]';

const isTrueValue = (value: unknown): boolean => {
    return value === true || value === 'true' || value === 1 || value === '1';
};

const getStatusDisplay = (record: Record<string, unknown>): {
    statusLabel: string;
    statusClass: string;
    disputeLabel: string;
    disputeClass: string;
    showDispute: boolean;
} => {
    const failed = isTrueValue(record.error);
    const dispute = isTrueValue(record.dispute) || isTrueValue(record.possibleDispute);

    return {
        statusLabel: failed ? 'FAILED' : 'SUCCESS',
        statusClass: failed
            ? 'border-red-200 bg-red-50 text-red-700'
            : 'border-emerald-200 bg-emerald-50 text-emerald-700',
        disputeLabel: dispute ? 'DISPUTE' : 'NO DISPUTE',
        disputeClass: dispute
            ? 'border-red-200 bg-red-50 text-red-700'
            : 'border-slate-200 bg-slate-50 text-slate-500',
        showDispute: dispute,
    };
};

interface PatchErrorChip {
    label: string;
    tone: 'neutral' | 'warn' | 'danger';
}

interface PatchErrorContextRow {
    label: string;
    value: string;
}

interface PatchErrorDisplay {
    visible: boolean;
    headline: string;
    chips: PatchErrorChip[];
    message: string | null;
    responseBody: string | null;
    contextRows: PatchErrorContextRow[];
    occurredAtAbsolute: string | null;
    occurredAtRelative: string | null;
    extraJson: string | null;
    raw: string;
}

const KNOWN_PATCH_ERROR_FIELDS = new Set([
    'source',
    'operation',
    'httpStatus',
    'code',
    'message',
    'responseBody',
    'context',
    'occurredAt',
]);

const CONTEXT_LABELS: Record<string, string> = {
    transferId:  'Transfer ID',
    payeeMobile: 'Payee mobile',
    amount:      'Amount',
    currency:    'Currency',
    externalId:  'External ID',
};

const toDisplayString = (value: unknown): string => {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);

    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
};

const httpStatusTone = (status: number): PatchErrorChip['tone'] => {
    if (status >= 500) return 'danger';
    if (status >= 400) return 'warn';
    return 'neutral';
};

const toRelativeTime = (iso: string): string | null => {
    const at = Date.parse(iso);
    if (Number.isNaN(at)) return null;

    const diffMs = Date.now() - at;
    const absSec = Math.round(Math.abs(diffMs) / 1000);
    const suffix = diffMs >= 0 ? 'ago' : 'from now';

    if (absSec < 60) return `${absSec}s ${suffix}`;
    if (absSec < 3600) return `${Math.round(absSec / 60)}m ${suffix}`;
    if (absSec < 86_400) return `${Math.round(absSec / 3600)}h ${suffix}`;
    return `${Math.round(absSec / 86_400)}d ${suffix}`;
};

const getPatchErrorDisplay = (record: Record<string, unknown>): PatchErrorDisplay => {
    const value = record.patchError;
    const raw = typeof value === 'string' ? value.trim() : '';
    const empty: PatchErrorDisplay = {
        visible: false,
        headline: '',
        chips: [],
        message: null,
        responseBody: null,
        contextRows: [],
        occurredAtAbsolute: null,
        occurredAtRelative: null,
        extraJson: null,
        raw: '',
    };

    if (raw.length === 0) return empty;

    let parsed: Record<string, unknown> | null = null;

    if (raw.startsWith('{')) {
        try {
            const candidate: unknown = JSON.parse(raw);
            if (candidate != null && typeof candidate === 'object' && !Array.isArray(candidate)) {
                parsed = candidate as Record<string, unknown>;
            }
        } catch {
            parsed = null;
        }
    }

    if (parsed == null) {
        return {
            ...empty,
            visible: true,
            headline: 'Payee backend reported an error',
            raw,
        };
    }

    const source     = typeof parsed.source === 'string' ? parsed.source : null;
    const operation  = typeof parsed.operation === 'string' ? parsed.operation : null;
    const httpStatus = typeof parsed.httpStatus === 'number' ? parsed.httpStatus : null;
    const code       = typeof parsed.code === 'string' ? parsed.code : null;
    const message    = typeof parsed.message === 'string' && parsed.message.trim().length > 0
        ? parsed.message.trim()
        : null;
    const occurredAt = typeof parsed.occurredAt === 'string' ? parsed.occurredAt : null;

    const headline = operation != null && source != null
        ? `${operation} failed on ${source}`
        : operation != null
            ? `${operation} failed`
            : source != null
                ? `${source} reported an error`
                : 'Payee backend reported an error';

    const chips: PatchErrorChip[] = [];
    if (source != null)     chips.push({label: source, tone: 'neutral'});
    if (operation != null)  chips.push({label: operation, tone: 'neutral'});
    if (httpStatus != null) chips.push({label: `HTTP ${httpStatus}`, tone: httpStatusTone(httpStatus)});
    if (code != null)       chips.push({label: code, tone: 'warn'});

    let responseBody: string | null = null;
    if (parsed.responseBody !== undefined && parsed.responseBody !== null) {
        if (typeof parsed.responseBody === 'string') {
            responseBody = parsed.responseBody;
        } else {
            try {
                responseBody = JSON.stringify(parsed.responseBody, null, 2);
            } catch {
                responseBody = String(parsed.responseBody);
            }
        }
    }

    const contextRows: PatchErrorContextRow[] = [];
    const ctx = parsed.context;
    if (ctx != null && typeof ctx === 'object' && !Array.isArray(ctx)) {
        for (const [k, v] of Object.entries(ctx as Record<string, unknown>)) {
            const displayValue = toDisplayString(v);
            if (displayValue.length === 0) continue;
            contextRows.push({label: CONTEXT_LABELS[k] ?? k, value: displayValue});
        }
    }

    const extraEntries: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(parsed)) {
        if (!KNOWN_PATCH_ERROR_FIELDS.has(k)) extraEntries[k] = v;
    }
    const extraJson = Object.keys(extraEntries).length > 0
        ? JSON.stringify(extraEntries, null, 2)
        : null;

    return {
        visible: true,
        headline,
        chips,
        message,
        responseBody,
        contextRows,
        occurredAtAbsolute: occurredAt,
        occurredAtRelative: occurredAt != null ? toRelativeTime(occurredAt) : null,
        extraJson,
        raw,
    };
};

const getFlowDisplay = (record: Record<string, unknown>): {
    stages: Array<{label: string; className: string}>;
    transferState: string | null;
} => {
    const rawFlow = record.flow;
    const flow = typeof rawFlow === 'number'
        ? rawFlow
        : typeof rawFlow === 'string' && rawFlow.trim().length > 0
            ? Number(rawFlow)
            : null;

    if (flow == null || Number.isNaN(flow) || flow <= 0) {
        return {
            stages: [],
            transferState: null,
        };
    }

    const stages: Array<{label: string; className: string}> = [];

    if (flow >= 1) {
        stages.push({
            label: 'P',
            className: 'border-amber-200 bg-amber-100 text-amber-700',
        });
    }

    if (flow >= 2) {
        stages.push({
            label: 'Q',
            className: 'border-violet-200 bg-violet-100 text-violet-700',
        });
    }

    if (flow >= 3) {
        stages.push({
            label: 'T',
            className: 'border-rose-200 bg-rose-100 text-rose-700',
        });
    }

    return {
        stages,
        transferState: flow >= 3 ? formatOptionalValue(record.transferState) : null,
    };
};

const getDetailPayloads = (
    record: Record<string, unknown>,
    key: 'parties' | 'quotes' | 'transfers',
): {request: unknown; response: unknown; error: unknown} => {
    return {
        request: record[`${key}Request`],
        response: record[`${key}Response`],
        error: record[`${key}Error`],
    };
};

const getDesktopHeaderCellClass = (columnKey: string): string => {
    switch (columnKey) {
        case 'correlationId':
            return 'w-[15%]';
        case 'payer':
            return 'w-[12%]';
        case 'payee':
            return 'w-[12%]';
        case 'transferType':
            return 'w-[10%]';
        case 'amount':
            return 'w-[10%] text-right';
        case 'transactionStartAt':
            return 'w-[15%]';
        case 'status':
            return 'w-[7%] text-center';
        case 'details':
            return 'w-[10%] text-center';
        default:
            return '';
    }
};

const getDesktopBodyCellClass = (columnKey: string): string => {
    switch (columnKey) {
        case 'amount':
            return 'text-right';
        case 'status':
            return 'text-center';
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

const openDetailsModal = async (record: Record<string, unknown>): Promise<void> => {
    const transferIdValue = record.correlationId;

    if (typeof transferIdValue !== 'string' || transferIdValue.trim().length === 0) {
        return;
    }

    const transferId = transferIdValue.trim();

    selectedTransaction.value = {
        title: `Transaction Details - ${transferId}`,
        record: {},
    };
    transactionDetailsLoading.value = true;
    transactionDetailsError.value = null;
    activeDetailsTab.value = 'parties';

    try {
        const requestPath = `${props.viewDefinition.endpoint}/${encodeURIComponent(transferId)}`;
        const payload = await apiClient.get<{record?: Record<string, unknown>}>(requestPath);
        const detailRecord = payload.record;

        if (detailRecord == null || typeof detailRecord !== 'object') {
            throw new Error('Transaction detail response is invalid.');
        }

        selectedTransaction.value = {
            title: `Transaction Details - ${transferId}`,
            record: detailRecord,
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        transactionDetailsError.value = message;
    } finally {
        transactionDetailsLoading.value = false;
    }
};

const closePayloadModal = (): void => {
    selectedTransaction.value = null;
    transactionDetailsLoading.value = false;
    transactionDetailsError.value = null;
    activeDetailsTab.value = 'parties';
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

    navigateToSearchRoute();
};

// Keyset paging is ephemeral: it mutates `nav` + the running offset and re-runs the list
// query directly (no route change, no re-count).
const goToPreviousPage = (): void => {
    if (!canGoPreviousPage.value) {
        return;
    }

    nav.direction = 'prev';
    nav.token = pageInfo.value.startCursor ?? '';
    rowStart.value = Math.max(1, rowStart.value - state.size);
    rowStartKnown.value = true;
    void runSearch();
};

const goToNextPage = (): void => {
    if (!canGoNextPage.value) {
        return;
    }

    nav.direction = 'next';
    nav.token = pageInfo.value.endCursor ?? '';
    rowStart.value += results.value?.records.length ?? 0;
    rowStartKnown.value = true;
    void runSearch();
};

const goToFirstPage = (): void => {
    if (loading.value || !pageInfo.value.hasPrev) {
        return;
    }

    nav.direction = 'first';
    nav.token = '';
    rowStart.value = 1;
    rowStartKnown.value = true;
    void runSearch();
};

const goToLastPage = (): void => {
    if (loading.value || !pageInfo.value.hasNext) {
        return;
    }

    nav.direction = 'last';
    nav.token = '';
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
                        Audit
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

                <section v-if="requestError || loading || results || isDownloading || readyFile || (downloadStatus === 'FAILED' && failedMessage)">
        <article class="overflow-hidden border border-accent/20 bg-white shadow-[0_18px_40px_rgba(20,127,195,0.08)]">
            <div class="border-b border-accent/15 bg-[#f8fbff] px-4 py-3">
                <div class="flex flex-wrap items-center gap-3 text-sm">
                    <h3 class="mr-auto font-display text-sm font-semibold uppercase tracking-[0.08em] text-accent">
                        Search Results
                    </h3>
                    <template v-if="results && !loading">
                        <span class="rounded-full bg-accentSoft px-3 py-1 font-semibold text-accent">
                            Total: <span v-if="countLoading" class="inline-block h-2 w-2 animate-pulse rounded-full bg-accent align-middle" /><template v-else>{{ countDisplay }}</template>
                        </span>
                        <span class="inline-flex items-center gap-2 rounded-full border border-accent/25 bg-white px-3 py-1 text-accent">
                            <span>Time Zone:</span>
                            <span class="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700">
                                {{ selectedTimeZone }}
                            </span>
                        </span>
                        <label class="inline-flex items-center gap-2 rounded-full border border-accent/25 bg-white px-3 py-1 font-semibold text-accent">
                            <span>Format</span>
                            <select
                                v-model="reportFileType"
                                class="bg-transparent text-xs font-bold uppercase outline-none"
                                :disabled="reportRequesting || isDownloading"
                            >
                                <option value="xlsx">
                                    XLSX
                                </option>
                                <option value="csv">
                                    CSV
                                </option>
                            </select>
                        </label>
                        <button
                            type="button"
                            class="inline-flex items-center justify-center rounded-full border border-[#d97706] bg-[#d97706] px-3 py-1 font-semibold text-white transition hover:bg-[#b45309] disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-300"
                            :disabled="reportRequesting || isDownloading || loading"
                            @click="downloadTransactionDetailReport"
                        >
                            {{ reportRequesting || isDownloading ? 'Downloading...' : 'Download' }}
                        </button>
                    </template>
                </div>
            </div>

            <div class="space-y-4 p-4">
                <div
                    v-if="isDownloading"
                    class="flex items-start gap-3 border border-sky-200 bg-sky-50 px-3 py-3 text-sm text-sky-700"
                >
                    <span class="mt-0.5 h-3 w-3 shrink-0 animate-pulse rounded-full bg-sky-500" />
                    <div>
                        <p class="font-semibold">
                            {{ statusLabel[downloadStatus] ?? 'Processing report...' }}
                        </p>
                        <p class="mt-0.5 text-xs text-sky-600">
                            You can leave this page. Your transaction report will be available here once it is ready.
                        </p>
                    </div>
                </div>

                <div
                    v-if="readyFile"
                    class="flex flex-wrap items-center justify-between gap-3 border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-700"
                >
                    <div class="min-w-0">
                        <p class="font-semibold">
                            Report ready
                        </p>
                        <p class="truncate text-xs text-emerald-600" :title="readyFile.fileName">
                            {{ readyFile.fileName }} - Link expires in 24 hours
                        </p>
                    </div>
                    <button
                        type="button"
                        class="inline-flex items-center justify-center rounded-lg border border-emerald-600 bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-soft transition hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                        @click="consumeDownload"
                    >
                        Click to Download
                    </button>
                </div>

                <div
                    v-if="downloadStatus === 'FAILED' && failedMessage"
                    class="flex flex-wrap items-center justify-between gap-3 border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700"
                >
                    <div class="min-w-0">
                        <p class="font-semibold">
                            Report generation failed
                        </p>
                        <p class="text-xs text-red-600">
                            {{ failedMessage }}
                        </p>
                    </div>
                    <button
                        type="button"
                        class="inline-flex items-center justify-center rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 shadow-soft transition hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-200"
                        @click="clearDownloadState"
                    >
                        OK
                    </button>
                </div>

                <article v-if="loading" class="space-y-3 border border-slate-200 bg-[#f7faff] p-4">
                    <div class="h-4 w-48 animate-pulse bg-slate-200" />
                    <div class="h-24 animate-pulse bg-slate-100" />
                    <div class="h-24 animate-pulse bg-slate-100" />
                </article>

                <template v-if="results && !loading">
                    <PaginationInfoBar
                        class="border border-slate-200 bg-[#fbfdff] px-3 py-3"
                        :record-start="recordWindow.start"
                        :record-end="recordWindow.end"
                        :record-start-known="rowStartKnown"
                        :page-size="state.size"
                        :can-go-previous-page="canGoPreviousPage"
                        :can-go-next-page="canGoNextPage"
                        @open-page-size="openPageSizeDialog"
                        @first-page="goToFirstPage"
                        @previous-page="goToPreviousPage"
                        @next-page="goToNextPage"
                        @last-page="goToLastPage"
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
                                                <span v-if="column.key !== 'details'">{{ column.label.toUpperCase() }}</span>
                                                <svg
                                                    v-else
                                                    class="h-4 w-4"
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    stroke-width="2"
                                                    stroke-linecap="round"
                                                    stroke-linejoin="round"
                                                    aria-hidden="true"
                                                >
                                                    <circle cx="12" cy="12" r="1" />
                                                    <circle cx="19" cy="12" r="1" />
                                                    <circle cx="5" cy="12" r="1" />
                                                </svg>
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
                                                <p class="inline-flex rounded-md border border-accent/20 bg-accentSoft px-2 py-1 font-semibold leading-4 text-accent">
                                                    {{ getPartyDisplay(record, 'payer').fsp }}
                                                </p>
                                                <div class="space-y-1 text-[11px] leading-4 text-slate-600">
                                                    <p>
                                                        <span class="font-semibold text-ink underline decoration-accent/50 underline-offset-2">
                                                            {{ getPartyDisplay(record, 'payer').idType }}
                                                        </span>
                                                    </p>
                                                    <p class="flex items-center gap-1.5">
                                                        <svg
                                                            class="h-3.5 w-3.5 shrink-0 text-accent"
                                                            viewBox="0 0 24 24"
                                                            fill="none"
                                                            stroke="currentColor"
                                                            stroke-width="2"
                                                            stroke-linecap="round"
                                                            stroke-linejoin="round"
                                                            aria-hidden="true"
                                                        >
                                                            <path d="M5 12h12" />
                                                            <path d="m13 6 6 6-6 6" />
                                                        </svg>
                                                        <span class="font-semibold text-ink">{{ getPartyDisplay(record, 'payer').id }}</span>
                                                    </p>
                                                </div>
                                                <p v-if="hasVisibleValue(getPartyDisplay(record, 'payer').subId)" class="text-[11px] leading-4 text-slate-500">
                                                    <span class="font-semibold uppercase tracking-[0.08em]">Sub-ID</span>
                                                    {{ ' ' }}{{ getPartyDisplay(record, 'payer').subId }}
                                                </p>
                                            </div>
                                            <div v-else-if="column.key === 'payee'" class="space-y-1.5">
                                                <p class="inline-flex rounded-md border border-accent/20 bg-accentSoft px-2 py-1 font-semibold leading-4 text-accent">
                                                    {{ getPartyDisplay(record, 'payee').fsp }}
                                                </p>
                                                <div class="space-y-1 text-[11px] leading-4 text-slate-600">
                                                    <p>
                                                        <span class="font-semibold text-ink underline decoration-accent/50 underline-offset-2">
                                                            {{ getPartyDisplay(record, 'payee').idType }}
                                                        </span>
                                                    </p>
                                                    <p class="flex items-center gap-1.5">
                                                        <svg
                                                            class="h-3.5 w-3.5 shrink-0 text-accent"
                                                            viewBox="0 0 24 24"
                                                            fill="none"
                                                            stroke="currentColor"
                                                            stroke-width="2"
                                                            stroke-linecap="round"
                                                            stroke-linejoin="round"
                                                            aria-hidden="true"
                                                        >
                                                            <path d="M5 12h12" />
                                                            <path d="m13 6 6 6-6 6" />
                                                        </svg>
                                                        <span class="font-semibold text-ink">{{ getPartyDisplay(record, 'payee').id }}</span>
                                                    </p>
                                                </div>
                                                <p v-if="hasVisibleValue(getPartyDisplay(record, 'payee').subId)" class="text-[11px] leading-4 text-slate-500">
                                                    <span class="font-semibold uppercase tracking-[0.08em]">Sub-ID</span>
                                                    {{ ' ' }}{{ getPartyDisplay(record, 'payee').subId }}
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
                                            <div v-else-if="column.key === 'status'" class="flex flex-col items-center gap-1.5 text-center">
                                                <span
                                                    :class="[
                                                        STATUS_BADGE_BASE_CLASS,
                                                        getStatusDisplay(record).statusClass,
                                                    ]"
                                                >
                                                    {{ getStatusDisplay(record).statusLabel }}
                                                </span>
                                                <span
                                                    v-if="getStatusDisplay(record).showDispute"
                                                    :class="[
                                                        STATUS_BADGE_BASE_CLASS,
                                                        getStatusDisplay(record).disputeClass,
                                                    ]"
                                                >
                                                    {{ getStatusDisplay(record).disputeLabel }}
                                                </span>
                                                <span
                                                    v-if="hasVisibleValue(getFlowDisplay(record).transferState ?? '-')"
                                                    :class="[
                                                        STATUS_BADGE_BASE_CLASS,
                                                        'border-rose-200 bg-rose-50 text-rose-700',
                                                    ]"
                                                >
                                                    {{ getFlowDisplay(record).transferState }}
                                                </span>
                                                <div
                                                    v-if="getFlowDisplay(record).stages.length > 0"
                                                    class="flex flex-wrap items-center justify-center gap-1"
                                                >
                                                    <span
                                                        v-for="stage in getFlowDisplay(record).stages"
                                                        :key="stage.label"
                                                        :class="[
                                                            'inline-flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-bold uppercase',
                                                            stage.className,
                                                        ]"
                                                    >
                                                        {{ stage.label }}
                                                    </span>
                                                </div>
                                            </div>
                                            <div v-else-if="column.key === 'transactionStartAt'" class="space-y-1.5">
                                                <div>
                                                    <p class="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                                                        Started
                                                    </p>
                                                    <div class="space-y-1">
                                                        <p class="text-[11px] leading-4 text-slate-700">
                                                            {{ getDateTimeDisplay(record).startedAt.dateTime }}
                                                        </p>
                                                        <span
                                                            v-if="getDateTimeDisplay(record).startedAt.hasValue"
                                                            class="inline-flex rounded-md border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700"
                                                        >
                                                            {{ getDateTimeDisplay(record).startedAt.zone }}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div>
                                                    <p class="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                                                        Completed
                                                    </p>
                                                    <div class="space-y-1">
                                                        <p class="text-[11px] leading-4 text-slate-700">
                                                            {{ getDateTimeDisplay(record).completedAt.dateTime }}
                                                        </p>
                                                        <span
                                                            v-if="getDateTimeDisplay(record).completedAt.hasValue"
                                                            class="inline-flex rounded-md border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700"
                                                        >
                                                            {{ getDateTimeDisplay(record).completedAt.zone }}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div v-else-if="column.key === 'details'" class="flex justify-center">
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
                                        <p class="inline-flex rounded-md border border-accent/20 bg-accentSoft px-2.5 py-1 font-semibold text-accent">
                                            {{ getPartyDisplay(record, 'payer').fsp }}
                                        </p>
                                        <div class="space-y-1 text-sm text-slate-600">
                                            <p>
                                                <span class="font-semibold text-ink underline decoration-accent/50 underline-offset-2">
                                                    {{ getPartyDisplay(record, 'payer').idType }}
                                                </span>
                                            </p>
                                            <p class="flex items-center gap-2">
                                                <svg
                                                    class="h-4 w-4 shrink-0 text-accent"
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    stroke-width="2"
                                                    stroke-linecap="round"
                                                    stroke-linejoin="round"
                                                    aria-hidden="true"
                                                >
                                                    <path d="M5 12h12" />
                                                    <path d="m13 6 6 6-6 6" />
                                                </svg>
                                                <span class="font-semibold text-ink">{{ getPartyDisplay(record, 'payer').id }}</span>
                                            </p>
                                        </div>
                                        <p v-if="hasVisibleValue(getPartyDisplay(record, 'payer').subId)" class="text-sm text-slate-500">
                                            <span class="font-semibold uppercase tracking-[0.08em]">Sub-ID</span>
                                            {{ ' ' }}{{ getPartyDisplay(record, 'payer').subId }}
                                        </p>
                                    </section>

                                    <section class="space-y-1.5">
                                        <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-accent">
                                            Payee
                                        </p>
                                        <p class="inline-flex rounded-md border border-accent/20 bg-accentSoft px-2.5 py-1 font-semibold text-accent">
                                            {{ getPartyDisplay(record, 'payee').fsp }}
                                        </p>
                                        <div class="space-y-1 text-sm text-slate-600">
                                            <p>
                                                <span class="font-semibold text-ink underline decoration-accent/50 underline-offset-2">
                                                    {{ getPartyDisplay(record, 'payee').idType }}
                                                </span>
                                            </p>
                                            <p class="flex items-center gap-2">
                                                <svg
                                                    class="h-4 w-4 shrink-0 text-accent"
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    stroke-width="2"
                                                    stroke-linecap="round"
                                                    stroke-linejoin="round"
                                                    aria-hidden="true"
                                                >
                                                    <path d="M5 12h12" />
                                                    <path d="m13 6 6 6-6 6" />
                                                </svg>
                                                <span class="font-semibold text-ink">{{ getPartyDisplay(record, 'payee').id }}</span>
                                            </p>
                                        </div>
                                        <p v-if="hasVisibleValue(getPartyDisplay(record, 'payee').subId)" class="text-sm text-slate-500">
                                            <span class="font-semibold uppercase tracking-[0.08em]">Sub-ID</span>
                                            {{ ' ' }}{{ getPartyDisplay(record, 'payee').subId }}
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
                                        <div class="flex flex-col items-center gap-1.5 text-center">
                                            <span
                                                :class="[
                                                    STATUS_BADGE_BASE_CLASS,
                                                    getStatusDisplay(record).statusClass,
                                                ]"
                                            >
                                                {{ getStatusDisplay(record).statusLabel }}
                                            </span>
                                            <span
                                                v-if="getStatusDisplay(record).showDispute"
                                                :class="[
                                                    STATUS_BADGE_BASE_CLASS,
                                                    getStatusDisplay(record).disputeClass,
                                                ]"
                                            >
                                                {{ getStatusDisplay(record).disputeLabel }}
                                            </span>
                                            <span
                                                v-if="hasVisibleValue(getFlowDisplay(record).transferState ?? '-')"
                                                :class="[
                                                    STATUS_BADGE_BASE_CLASS,
                                                    'border-rose-200 bg-rose-50 text-rose-700',
                                                ]"
                                            >
                                                {{ getFlowDisplay(record).transferState }}
                                            </span>
                                            <div
                                                v-if="getFlowDisplay(record).stages.length > 0"
                                                class="flex flex-wrap items-center justify-center gap-1"
                                            >
                                                <span
                                                    v-for="stage in getFlowDisplay(record).stages"
                                                    :key="stage.label"
                                                    :class="[
                                                        'inline-flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-bold uppercase',
                                                        stage.className,
                                                    ]"
                                                >
                                                    {{ stage.label }}
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
                                            <div class="space-y-1">
                                                <p class="text-sm text-slate-700">
                                                    {{ getDateTimeDisplay(record).startedAt.dateTime }}
                                                </p>
                                                <span
                                                    v-if="getDateTimeDisplay(record).startedAt.hasValue"
                                                    class="inline-flex rounded-md border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700"
                                                >
                                                    {{ getDateTimeDisplay(record).startedAt.zone }}
                                                </span>
                                            </div>
                                        </div>
                                        <div>
                                            <p class="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                                                Completed
                                            </p>
                                            <div class="space-y-1">
                                                <p class="text-sm text-slate-700">
                                                    {{ getDateTimeDisplay(record).completedAt.dateTime }}
                                                </p>
                                                <span
                                                    v-if="getDateTimeDisplay(record).completedAt.hasValue"
                                                    class="inline-flex rounded-md border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700"
                                                >
                                                    {{ getDateTimeDisplay(record).completedAt.zone }}
                                                </span>
                                            </div>
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
                                :record-start="recordWindow.start"
                                :record-end="recordWindow.end"
                                :record-start-known="rowStartKnown"
                                :page-size="state.size"
                                :can-go-previous-page="canGoPreviousPage"
                                :can-go-next-page="canGoNextPage"
                                @open-page-size="openPageSizeDialog"
                                @first-page="goToFirstPage"
                                @previous-page="goToPreviousPage"
                                @next-page="goToNextPage"
                                @last-page="goToLastPage"
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
            v-if="selectedTransaction"
            class="fixed inset-0 z-[80] flex items-center justify-center p-4"
        >
            <div class="absolute inset-0 bg-slate-950/45" @click="closePayloadModal" />
            <div class="relative flex max-h-[85vh] w-full max-w-6xl flex-col rounded-2xl bg-[#f8fbff] p-4 shadow-soft">
                <div class="mb-3 flex items-center justify-between border-b border-slate-200 pb-3">
                    <h3 class="font-display text-lg text-ink">{{ selectedTransaction.title }}</h3>
                    <button
                        type="button"
                        class="rounded-lg px-2 py-1 text-slate-500 transition hover:bg-slate-100"
                        @click="closePayloadModal"
                    >
                        ✕
                    </button>
                </div>

                <div class="overflow-y-auto pr-1">
                <div v-if="transactionDetailsLoading" class="space-y-3">
                    <div class="h-5 w-48 animate-pulse rounded bg-slate-200" />
                    <div class="grid gap-3 md:grid-cols-4">
                        <div class="h-20 animate-pulse rounded-xl bg-slate-100" />
                        <div class="h-20 animate-pulse rounded-xl bg-slate-100" />
                        <div class="h-20 animate-pulse rounded-xl bg-slate-100" />
                        <div class="h-20 animate-pulse rounded-xl bg-slate-100" />
                    </div>
                    <div class="h-64 animate-pulse rounded-xl bg-slate-100" />
                </div>

                <div v-else-if="transactionDetailsError" class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {{ transactionDetailsError }}
                </div>

                <div v-else class="space-y-4">
                    <div class="space-y-3 rounded-xl border border-accent/15 bg-white px-3 py-3">
                        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-2.5">
                            <div class="min-w-0">
                                <p class="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">Transfer ID</p>
                                <p class="mt-1 truncate font-mono text-[13px] text-ink sm:break-all sm:whitespace-normal">
                                    {{ formatValue(selectedTransaction.record.transferId ?? selectedTransaction.record.correlationId) }}
                                </p>
                            </div>
                            <div class="flex flex-col items-end gap-1.5">
                                <span
                                    :class="[
                                        STATUS_BADGE_BASE_CLASS,
                                        getStatusDisplay(selectedTransaction.record).statusClass,
                                    ]"
                                >
                                    {{ getStatusDisplay(selectedTransaction.record).statusLabel }}
                                </span>
                                <span
                                    :class="[
                                        STATUS_BADGE_BASE_CLASS,
                                        getStatusDisplay(selectedTransaction.record).disputeClass,
                                    ]"
                                >
                                    {{ getStatusDisplay(selectedTransaction.record).disputeLabel }}
                                </span>
                            </div>
                        </div>

                        <section
                            v-if="getPatchErrorDisplay(selectedTransaction.record).visible"
                            class="space-y-3 rounded-xl border border-red-200 bg-red-50/60 px-3.5 py-3"
                        >
                            <header class="flex items-start gap-2.5">
                                <span
                                    class="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-700"
                                    aria-hidden="true"
                                >
                                    <svg
                                        class="h-3.5 w-3.5"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2.25"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                    >
                                        <path d="M12 9v4" />
                                        <path d="M12 17h.01" />
                                        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                                    </svg>
                                </span>
                                <div class="min-w-0">
                                    <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-red-700">
                                        Dispute Reason
                                    </p>
                                    <p class="mt-0.5 text-[13px] font-semibold text-ink">
                                        {{ getPatchErrorDisplay(selectedTransaction.record).headline }}
                                    </p>
                                </div>
                            </header>

                            <div
                                v-if="getPatchErrorDisplay(selectedTransaction.record).chips.length > 0"
                                class="flex flex-wrap gap-1.5"
                            >
                                <span
                                    v-for="chip in getPatchErrorDisplay(selectedTransaction.record).chips"
                                    :key="chip.label"
                                    :class="[
                                        'inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em]',
                                        chip.tone === 'danger' ? 'border-red-300 bg-red-100 text-red-800' : '',
                                        chip.tone === 'warn'   ? 'border-amber-300 bg-amber-100 text-amber-800' : '',
                                        chip.tone === 'neutral'? 'border-slate-300 bg-white text-slate-700' : '',
                                    ]"
                                >
                                    {{ chip.label }}
                                </span>
                            </div>

                            <div v-if="getPatchErrorDisplay(selectedTransaction.record).message">
                                <p class="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                                    Backend message
                                </p>
                                <p class="mt-1 text-[13px] leading-5 text-ink">
                                    {{ getPatchErrorDisplay(selectedTransaction.record).message }}
                                </p>
                            </div>

                            <div v-if="getPatchErrorDisplay(selectedTransaction.record).contextRows.length > 0">
                                <p class="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                                    Context
                                </p>
                                <dl class="mt-1 grid gap-x-4 gap-y-1 text-[12px] sm:grid-cols-2">
                                    <div
                                        v-for="row in getPatchErrorDisplay(selectedTransaction.record).contextRows"
                                        :key="row.label"
                                        class="flex items-baseline gap-2"
                                    >
                                        <dt class="shrink-0 text-slate-500">{{ row.label }}</dt>
                                        <dd class="min-w-0 break-all font-mono text-ink">{{ row.value }}</dd>
                                    </div>
                                </dl>
                            </div>

                            <details
                                v-if="getPatchErrorDisplay(selectedTransaction.record).responseBody"
                                class="group rounded-md border border-slate-200 bg-white/70"
                            >
                                <summary class="cursor-pointer select-none px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-600 group-open:border-b group-open:border-slate-200">
                                    Backend response body
                                </summary>
                                <pre class="overflow-x-auto whitespace-pre-wrap break-all px-2.5 py-2 text-[12px] font-mono leading-5 text-ink">{{ getPatchErrorDisplay(selectedTransaction.record).responseBody }}</pre>
                            </details>

                            <details
                                v-if="getPatchErrorDisplay(selectedTransaction.record).extraJson"
                                class="group rounded-md border border-slate-200 bg-white/70"
                            >
                                <summary class="cursor-pointer select-none px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-600 group-open:border-b group-open:border-slate-200">
                                    Additional fields
                                </summary>
                                <pre class="overflow-x-auto whitespace-pre-wrap break-all px-2.5 py-2 text-[12px] font-mono leading-5 text-ink">{{ getPatchErrorDisplay(selectedTransaction.record).extraJson }}</pre>
                            </details>

                            <p
                                v-if="getPatchErrorDisplay(selectedTransaction.record).occurredAtAbsolute"
                                class="text-[11px] text-slate-500"
                            >
                                Reported
                                <span v-if="getPatchErrorDisplay(selectedTransaction.record).occurredAtRelative">
                                    {{ getPatchErrorDisplay(selectedTransaction.record).occurredAtRelative }}
                                </span>
                                <span class="font-mono">
                                    ({{ getPatchErrorDisplay(selectedTransaction.record).occurredAtAbsolute }})
                                </span>
                            </p>

                            <pre
                                v-if="getPatchErrorDisplay(selectedTransaction.record).chips.length === 0
                                    && !getPatchErrorDisplay(selectedTransaction.record).message
                                    && !getPatchErrorDisplay(selectedTransaction.record).responseBody"
                                class="overflow-x-auto whitespace-pre-wrap break-all rounded-md bg-white/70 px-2.5 py-2 text-[12px] font-mono leading-5 text-ink"
                            >{{ getPatchErrorDisplay(selectedTransaction.record).raw }}</pre>
                        </section>

                        <div class="grid gap-2.5 xl:grid-cols-4">
                            <section class="space-y-1.5 rounded-xl border border-accent/10 bg-[#fafdff] px-3 py-2.5">
                                <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-accent">
                                    Payer
                                </p>
                                <p class="inline-flex rounded-md border border-accent/20 bg-accentSoft px-2 py-0.5 text-sm font-semibold text-accent">
                                    {{ getPartyDisplay(selectedTransaction.record, 'payer').fsp }}
                                </p>
                                <div class="space-y-0.5 text-[12px] text-slate-600">
                                    <p class="leading-5">
                                        <span class="font-semibold text-ink underline decoration-accent/50 underline-offset-2">
                                            {{ getPartyDisplay(selectedTransaction.record, 'payer').idType }}
                                        </span>
                                    </p>
                                    <p class="flex items-center gap-1.5 leading-5">
                                        <svg
                                            class="h-3.5 w-3.5 shrink-0 text-accent"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            stroke-width="2"
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            aria-hidden="true"
                                        >
                                            <path d="M5 12h12" />
                                            <path d="m13 6 6 6-6 6" />
                                        </svg>
                                        <span class="font-semibold text-ink">{{ getPartyDisplay(selectedTransaction.record, 'payer').id }}</span>
                                    </p>
                                </div>
                                <p v-if="hasVisibleValue(getPartyDisplay(selectedTransaction.record, 'payer').subId)" class="text-[12px] leading-5 text-slate-500">
                                    <span class="font-semibold uppercase tracking-[0.08em]">Sub-ID</span>
                                    {{ ' ' }}{{ getPartyDisplay(selectedTransaction.record, 'payer').subId }}
                                </p>
                            </section>

                            <section class="space-y-1.5 rounded-xl border border-accent/10 bg-[#fafdff] px-3 py-2.5">
                                <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-accent">
                                    Payee
                                </p>
                                <p class="inline-flex rounded-md border border-accent/20 bg-accentSoft px-2 py-0.5 text-sm font-semibold text-accent">
                                    {{ getPartyDisplay(selectedTransaction.record, 'payee').fsp }}
                                </p>
                                <div class="space-y-0.5 text-[12px] text-slate-600">
                                    <p class="leading-5">
                                        <span class="font-semibold text-ink underline decoration-accent/50 underline-offset-2">
                                            {{ getPartyDisplay(selectedTransaction.record, 'payee').idType }}
                                        </span>
                                    </p>
                                    <p class="flex items-center gap-1.5 leading-5">
                                        <svg
                                            class="h-3.5 w-3.5 shrink-0 text-accent"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            stroke-width="2"
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            aria-hidden="true"
                                        >
                                            <path d="M5 12h12" />
                                            <path d="m13 6 6 6-6 6" />
                                        </svg>
                                        <span class="font-semibold text-ink">{{ getPartyDisplay(selectedTransaction.record, 'payee').id }}</span>
                                    </p>
                                </div>
                                <p v-if="hasVisibleValue(getPartyDisplay(selectedTransaction.record, 'payee').subId)" class="text-[12px] leading-5 text-slate-500">
                                    <span class="font-semibold uppercase tracking-[0.08em]">Sub-ID</span>
                                    {{ ' ' }}{{ getPartyDisplay(selectedTransaction.record, 'payee').subId }}
                                </p>
                            </section>

                            <section class="space-y-2 rounded-xl border border-accent/10 bg-[#fafdff] px-3 py-2.5">
                                <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-accent">
                                    Amount
                                </p>
                                <div>
                                    <p class="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                                        Quoting
                                    </p>
                                    <p class="text-right text-sm font-semibold text-slate-700 tabular-nums">
                                        {{ getAmountDisplay(selectedTransaction.record).quoting }}
                                    </p>
                                </div>
                                <div>
                                    <p class="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                                        Transfer
                                    </p>
                                    <p class="text-right text-sm font-semibold text-slate-700 tabular-nums">
                                        {{ getAmountDisplay(selectedTransaction.record).transfer }}
                                    </p>
                                </div>
                            </section>

                            <section class="space-y-2 rounded-xl border border-accent/10 bg-[#fafdff] px-3 py-2.5">
                                <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-accent">
                                    Timeline
                                </p>
                                <div>
                                    <p class="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                                        Started
                                    </p>
                                    <div class="space-y-1">
                                        <p class="text-[12px] leading-5 text-slate-700">
                                            {{ getDateTimeDisplay(selectedTransaction.record).startedAt.dateTime }}
                                        </p>
                                        <span
                                            v-if="getDateTimeDisplay(selectedTransaction.record).startedAt.hasValue"
                                            class="inline-flex rounded-md border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700"
                                        >
                                            {{ getDateTimeDisplay(selectedTransaction.record).startedAt.zone }}
                                        </span>
                                    </div>
                                </div>
                                <div>
                                    <p class="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                                        Completed
                                    </p>
                                    <div class="space-y-1">
                                        <p class="text-[12px] leading-5 text-slate-700">
                                            {{ getDateTimeDisplay(selectedTransaction.record).completedAt.dateTime }}
                                        </p>
                                        <span
                                            v-if="getDateTimeDisplay(selectedTransaction.record).completedAt.hasValue"
                                            class="inline-flex rounded-md border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700"
                                        >
                                            {{ getDateTimeDisplay(selectedTransaction.record).completedAt.zone }}
                                        </span>
                                    </div>
                                </div>
                                <div>
                                    <p class="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                                        Duration
                                    </p>
                                    <p class="text-[12px] font-semibold leading-5 text-ink">
                                        {{ getDurationDisplay(selectedTransaction.record) }}
                                    </p>
                                </div>
                            </section>
                        </div>
                    </div>

                    <div class="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
                        <button
                            type="button"
                            :class="[
                                'rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] transition',
                                activeDetailsTab === 'parties'
                                    ? 'border-accent bg-accent text-white'
                                    : 'border-accent/20 bg-white text-accent hover:border-accent',
                            ]"
                            @click="activeDetailsTab = 'parties'"
                        >
                            Parties
                        </button>
                        <button
                            type="button"
                            :class="[
                                'rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] transition',
                                activeDetailsTab === 'quotes'
                                    ? 'border-accent bg-accent text-white'
                                    : 'border-accent/20 bg-white text-accent hover:border-accent',
                            ]"
                            @click="activeDetailsTab = 'quotes'"
                        >
                            Quotes
                        </button>
                        <button
                            type="button"
                            :class="[
                                'rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] transition',
                                activeDetailsTab === 'transfers'
                                    ? 'border-accent bg-accent text-white'
                                    : 'border-accent/20 bg-white text-accent hover:border-accent',
                            ]"
                            @click="activeDetailsTab = 'transfers'"
                        >
                            Transfers
                        </button>
                    </div>

                    <div class="grid gap-4 xl:grid-cols-3 xl:auto-rows-fr">
                        <PrettyJsonViewer
                            title="Request"
                            :value="getDetailPayloads(selectedTransaction.record, activeDetailsTab).request"
                        />
                        <PrettyJsonViewer
                            title="Response"
                            :value="getDetailPayloads(selectedTransaction.record, activeDetailsTab).response"
                        />
                        <PrettyJsonViewer
                            title="Error"
                            :value="getDetailPayloads(selectedTransaction.record, activeDetailsTab).error"
                        />
                    </div>
                </div>
                </div>
            </div>
        </div>
    </Teleport>
</template>
