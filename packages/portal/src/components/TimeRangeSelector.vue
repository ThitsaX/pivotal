<script setup lang="ts">
import {onMounted, ref, watch} from 'vue';
import CustomDropdown from './CustomDropdown.vue';

type RangeMode = 'today' | 'last24' | 'custom';

const props = defineProps<{
    label: string;
    selectedTimeZone: string;
    mode?: string;
    startValue: string;
    endValue: string;
}>();

const emit = defineEmits<{
    (event: 'update:startValue', value: string): void;
    (event: 'update:endValue', value: string): void;
    (event: 'update:mode', value: string): void;
}>();

const padTwo = (value: number | string): string => String(value).padStart(2, '0');

const RANGE_OPTIONS: Array<{label: string; value: string}> = [
    {label: 'Today', value: 'today'},
    {label: 'Last 24 Hours', value: 'last24'},
    {label: 'Custom Range', value: 'custom'},
];

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const HOUR_OPTIONS: Array<{label: string; value: string}> = Array.from({length: 24}, (_, index) => {
    const value = padTwo(index);
    return {label: value, value};
});

const MINUTE_SECOND_OPTIONS: Array<{label: string; value: string}> = Array.from({length: 60}, (_, index) => {
    const value = padTwo(index);
    return {label: value, value};
});

const selectedMode = ref<RangeMode | ''>('');

const customStartDate = ref('');
const customStartHour = ref('00');
const customStartMinute = ref('00');
const customStartSecond = ref('00');

const customEndDate = ref('');
const customEndHour = ref('00');
const customEndMinute = ref('00');
const customEndSecond = ref('00');

const startDateInputRef = ref<HTMLInputElement | null>(null);
const endDateInputRef = ref<HTMLInputElement | null>(null);

const formatDateDisplay = (dateStr: string): string => {
    if (!dateStr) return '';
    const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return dateStr;
    const day = match[3];
    const monthIndex = Number(match[2]) - 1;
    const year = match[1];
    return `${day}-${MONTH_ABBR[monthIndex]}-${year}`;
};

const openDatePicker = (target: 'start' | 'end'): void => {
    const input = target === 'start' ? startDateInputRef.value : endDateInputRef.value;
    if (input) {
        input.showPicker();
    }
};

const offsetMinutesForTimeZone = (date: Date, timeZone: string): number => {
    const zonePart = new Intl.DateTimeFormat('en-US', {
        timeZone,
        timeZoneName: 'shortOffset',
    }).formatToParts(date)
        .find((part: Intl.DateTimeFormatPart): boolean => part.type === 'timeZoneName')?.value ?? 'GMT+00:00';

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
    if (!localDateTime) {
        return '';
    }

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
    const offsetOne = offsetMinutesForTimeZone(new Date(utcGuess), timeZone);
    let utcMs = utcGuess - offsetOne * 60_000;
    const offsetTwo = offsetMinutesForTimeZone(new Date(utcMs), timeZone);
    utcMs = utcGuess - offsetTwo * 60_000;

    return new Date(utcMs).toISOString();
};

const formatPartsInZone = (date: Date, timeZone: string): {year: number; month: number; day: number} => {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date);

    const year = Number(parts.find((part: Intl.DateTimeFormatPart): boolean => part.type === 'year')?.value ?? '0');
    const month = Number(parts.find((part: Intl.DateTimeFormatPart): boolean => part.type === 'month')?.value ?? '1');
    const day = Number(parts.find((part: Intl.DateTimeFormatPart): boolean => part.type === 'day')?.value ?? '1');

    return {year, month, day};
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

const splitIsoToLocalParts = (
    isoValue: string,
    timeZone: string,
): {year: string; month: string; day: string; hour: string; minute: string; second: string} | null => {
    if (!isoValue) {
        return null;
    }

    const parsed = new Date(isoValue);

    if (Number.isNaN(parsed.getTime())) {
        return null;
    }

    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        hourCycle: 'h23',
    }).formatToParts(parsed);

    return {
        year: parts.find((part: Intl.DateTimeFormatPart): boolean => part.type === 'year')?.value ?? '',
        month: parts.find((part: Intl.DateTimeFormatPart): boolean => part.type === 'month')?.value ?? '',
        day: parts.find((part: Intl.DateTimeFormatPart): boolean => part.type === 'day')?.value ?? '',
        hour: parts.find((part: Intl.DateTimeFormatPart): boolean => part.type === 'hour')?.value ?? '00',
        minute: parts.find((part: Intl.DateTimeFormatPart): boolean => part.type === 'minute')?.value ?? '00',
        second: parts.find((part: Intl.DateTimeFormatPart): boolean => part.type === 'second')?.value ?? '00',
    };
};

const toLocalDateTime = (
    date: string,
    hour: string,
    minute: string,
    second: string,
): string => {
    if (!date) {
        return '';
    }

    const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (!match) {
        return '';
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const numericHour = Number(hour);
    const numericMinute = Number(minute);
    const numericSecond = Number(second);

    if (
        Number.isNaN(numericHour)
        || Number.isNaN(numericMinute)
        || Number.isNaN(numericSecond)
        || numericHour < 0
        || numericHour > 23
        || numericMinute < 0
        || numericMinute > 59
        || numericSecond < 0
        || numericSecond > 59
    ) {
        return '';
    }

    const candidate = new Date(Date.UTC(year, month - 1, day));

    if (
        candidate.getUTCFullYear() !== year
        || candidate.getUTCMonth() + 1 !== month
        || candidate.getUTCDate() !== day
    ) {
        return '';
    }

    return `${date}T${padTwo(hour)}:${padTwo(minute)}:${padTwo(second)}`;
};

const applyPreset = (mode: RangeMode): void => {
    const now = new Date();
    let startIso = '';
    let endIso = '';

    if (mode === 'today') {
        const today = formatPartsInZone(now, props.selectedTimeZone);
        const tomorrow = shiftDateByDays(today.year, today.month, today.day, 1);

        startIso = zonedLocalToUtcIso(localMidnight(today.year, today.month, today.day), props.selectedTimeZone);
        endIso = zonedLocalToUtcIso(localMidnight(tomorrow.year, tomorrow.month, tomorrow.day), props.selectedTimeZone);
    } else if (mode === 'last24') {
        endIso = now.toISOString();
        startIso = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    }

    emit('update:startValue', startIso);
    emit('update:endValue', endIso);
};

const detectPresetMode = (startValue: string, endValue: string): RangeMode | '' => {
    if (!startValue || !endValue) {
        return '';
    }

    const startTime = new Date(startValue).getTime();
    const endTime = new Date(endValue).getTime();

    if (Number.isNaN(startTime) || Number.isNaN(endTime) || endTime <= startTime) {
        return '';
    }

    const diffMs = endTime - startTime;
    const last24HoursMs = 24 * 60 * 60 * 1000;

    if (Math.abs(diffMs - last24HoursMs) <= 60_000) {
        return 'last24';
    }

    return '';
};

const applyCustom = (): void => {
    const startLocal = toLocalDateTime(
        customStartDate.value,
        customStartHour.value,
        customStartMinute.value,
        customStartSecond.value,
    );
    const endLocal = toLocalDateTime(
        customEndDate.value,
        customEndHour.value,
        customEndMinute.value,
        customEndSecond.value,
    );

    emit('update:startValue', startLocal ? zonedLocalToUtcIso(startLocal, props.selectedTimeZone) : '');
    emit('update:endValue', endLocal ? zonedLocalToUtcIso(endLocal, props.selectedTimeZone) : '');
};

const syncCustomInputsFromProps = (): void => {
    const start = splitIsoToLocalParts(props.startValue, props.selectedTimeZone);
    const end = splitIsoToLocalParts(props.endValue, props.selectedTimeZone);

    customStartDate.value = start != null ? `${start.year}-${start.month}-${start.day}` : '';
    customStartHour.value = start?.hour ?? '00';
    customStartMinute.value = start?.minute ?? '00';
    customStartSecond.value = start?.second ?? '00';

    customEndDate.value = end != null ? `${end.year}-${end.month}-${end.day}` : '';
    customEndHour.value = end?.hour ?? '00';
    customEndMinute.value = end?.minute ?? '00';
    customEndSecond.value = end?.second ?? '00';
};

const onModeSelected = (value: string): void => {
    selectedMode.value = value as RangeMode | '';
    emit('update:mode', value);

    if (!selectedMode.value) {
        emit('update:startValue', '');
        emit('update:endValue', '');
        return;
    }

    if (selectedMode.value === 'custom') {
        syncCustomInputsFromProps();
        applyCustom();
        return;
    }

    applyPreset(selectedMode.value);
};

const updateTimePart = (target: 'start' | 'end', part: 'hour' | 'minute' | 'second', value: string): void => {
    if (target === 'start') {
        if (part === 'hour') {
            customStartHour.value = value;
        } else if (part === 'minute') {
            customStartMinute.value = value;
        } else {
            customStartSecond.value = value;
        }
    } else if (part === 'hour') {
        customEndHour.value = value;
    } else if (part === 'minute') {
        customEndMinute.value = value;
    } else {
        customEndSecond.value = value;
    }

    applyCustom();
};

const updateDatePart = (target: 'start' | 'end', value: string): void => {
    if (target === 'start') {
        customStartDate.value = value;
    } else {
        customEndDate.value = value;
    }

    applyCustom();
};

onMounted((): void => {
    selectedMode.value = (props.mode as RangeMode | '') || detectPresetMode(props.startValue, props.endValue);
});

watch(
    () => props.mode,
    (mode): void => {
        if (mode != null) {
            selectedMode.value = mode as RangeMode | '';
        }
    },
);

watch(
    () => props.selectedTimeZone,
    (): void => {
        if (selectedMode.value === 'custom') {
            applyCustom();
            return;
        }

        if (selectedMode.value && selectedMode.value !== 'last24') {
            applyPreset(selectedMode.value);
        }
    },
);

watch(
    () => [props.startValue, props.endValue],
    ([startValue, endValue]): void => {
        if (selectedMode.value === 'custom') {
            syncCustomInputsFromProps();
            return;
        }

        if (!props.mode) {
            selectedMode.value = detectPresetMode(startValue, endValue);
        }
    },
);
</script>

<template>
    <div class="time-range-selector">
        <div class="flex items-center gap-2 mb-3">
            <svg class="h-4 w-4 text-accent" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z" clip-rule="evenodd" />
            </svg>
            <span class="text-sm font-semibold text-ink">{{ label }}</span>
        </div>

        <CustomDropdown
            :model-value="selectedMode"
            :options="RANGE_OPTIONS"
            placeholder="Select Range"
            button-class="!py-2.5 !text-sm !rounded-xl"
            @update:model-value="onModeSelected"
        />

        <Transition
            enter-active-class="transition-all duration-250 ease-out"
            enter-from-class="opacity-0 -translate-y-1 max-h-0"
            enter-to-class="opacity-100 translate-y-0 max-h-96"
            leave-active-class="transition-all duration-200 ease-in"
            leave-from-class="opacity-100 translate-y-0 max-h-96"
            leave-to-class="opacity-0 -translate-y-1 max-h-0"
        >
            <div v-if="selectedMode === 'custom'" class="mt-3">
                <div class="datetime-cards-grid">
                    <!-- From -->
                    <div class="datetime-card">
                        <div class="datetime-card-header">
                            <svg class="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                                <path fill-rule="evenodd" d="M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75z" clip-rule="evenodd" />
                            </svg>
                            <span>From</span>
                        </div>

                        <div class="datetime-fields">
                            <!-- Date picker -->
                            <div class="datetime-field-group">
                                <label class="datetime-field-label">Date</label>
                                <div class="date-picker-wrap" @click="openDatePicker('start')">
                                    <svg class="date-picker-icon" viewBox="0 0 20 20" fill="currentColor">
                                        <path fill-rule="evenodd" d="M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75z" clip-rule="evenodd" />
                                    </svg>
                                    <span :class="customStartDate ? 'text-ink' : 'text-slate-400'">
                                        {{ customStartDate ? formatDateDisplay(customStartDate) : 'dd-MMM-yyyy' }}
                                    </span>
                                    <input
                                        ref="startDateInputRef"
                                        :value="customStartDate"
                                        type="date"
                                        class="date-hidden-input"
                                        @input="updateDatePart('start', ($event.target as HTMLInputElement).value)"
                                    />
                                </div>
                            </div>

                            <!-- Time picker -->
                            <div class="datetime-field-group">
                                <label class="datetime-field-label">Time (24h)</label>
                                <div class="time-picker-row">
                                    <CustomDropdown
                                        :model-value="customStartHour"
                                        :options="HOUR_OPTIONS"
                                        placeholder="HH"
                                        button-class="time-dropdown-btn"
                                        menu-class="!w-20"
                                        @update:model-value="(v) => updateTimePart('start', 'hour', v)"
                                    />
                                    <span class="time-sep">:</span>
                                    <CustomDropdown
                                        :model-value="customStartMinute"
                                        :options="MINUTE_SECOND_OPTIONS"
                                        placeholder="MM"
                                        button-class="time-dropdown-btn"
                                        menu-class="!w-20"
                                        @update:model-value="(v) => updateTimePart('start', 'minute', v)"
                                    />
                                    <span class="time-sep">:</span>
                                    <CustomDropdown
                                        :model-value="customStartSecond"
                                        :options="MINUTE_SECOND_OPTIONS"
                                        placeholder="SS"
                                        button-class="time-dropdown-btn"
                                        menu-class="!w-20"
                                        @update:model-value="(v) => updateTimePart('start', 'second', v)"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- To -->
                    <div class="datetime-card">
                        <div class="datetime-card-header">
                            <svg class="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                                <path fill-rule="evenodd" d="M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75z" clip-rule="evenodd" />
                            </svg>
                            <span>To</span>
                        </div>

                        <div class="datetime-fields">
                            <!-- Date picker -->
                            <div class="datetime-field-group">
                                <label class="datetime-field-label">Date</label>
                                <div class="date-picker-wrap" @click="openDatePicker('end')">
                                    <svg class="date-picker-icon" viewBox="0 0 20 20" fill="currentColor">
                                        <path fill-rule="evenodd" d="M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75z" clip-rule="evenodd" />
                                    </svg>
                                    <span :class="customEndDate ? 'text-ink' : 'text-slate-400'">
                                        {{ customEndDate ? formatDateDisplay(customEndDate) : 'dd-MMM-yyyy' }}
                                    </span>
                                    <input
                                        ref="endDateInputRef"
                                        :value="customEndDate"
                                        type="date"
                                        class="date-hidden-input"
                                        @input="updateDatePart('end', ($event.target as HTMLInputElement).value)"
                                    />
                                </div>
                            </div>

                            <!-- Time picker -->
                            <div class="datetime-field-group">
                                <label class="datetime-field-label">Time (24h)</label>
                                <div class="time-picker-row">
                                    <CustomDropdown
                                        :model-value="customEndHour"
                                        :options="HOUR_OPTIONS"
                                        placeholder="HH"
                                        button-class="time-dropdown-btn"
                                        menu-class="!w-20"
                                        @update:model-value="(v) => updateTimePart('end', 'hour', v)"
                                    />
                                    <span class="time-sep">:</span>
                                    <CustomDropdown
                                        :model-value="customEndMinute"
                                        :options="MINUTE_SECOND_OPTIONS"
                                        placeholder="MM"
                                        button-class="time-dropdown-btn"
                                        menu-class="!w-20"
                                        @update:model-value="(v) => updateTimePart('end', 'minute', v)"
                                    />
                                    <span class="time-sep">:</span>
                                    <CustomDropdown
                                        :model-value="customEndSecond"
                                        :options="MINUTE_SECOND_OPTIONS"
                                        placeholder="SS"
                                        button-class="time-dropdown-btn"
                                        menu-class="!w-20"
                                        @update:model-value="(v) => updateTimePart('end', 'second', v)"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </Transition>
    </div>
</template>

<style scoped>
.time-range-selector {
    @apply rounded-2xl border bg-gradient-to-b from-white p-4 shadow-sm;
    border-color: rgba(226, 232, 240, 0.8);
    --tw-gradient-to: rgba(248, 250, 252, 0.5);
}

.datetime-cards-grid {
    display: grid;
    gap: 0.75rem;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr));
}

.datetime-card {
    @apply min-w-0 rounded-xl border bg-gradient-to-br from-[#f8fbff] to-[#f0f7ff] p-3 transition-all duration-200;
    border-color: rgba(25, 151, 231, 0.12);
}

.datetime-card:hover {
    @apply shadow-sm;
    border-color: rgba(25, 151, 231, 0.25);
}

.datetime-card-header {
    @apply mb-2.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-accent;
}

.datetime-fields {
    @apply space-y-2.5;
}

.datetime-field-group {
    @apply space-y-1;
}

.datetime-field-label {
    @apply text-[11px] font-medium text-slate-500;
}

/* Date picker - clickable button that opens native date picker */
.date-picker-wrap {
    @apply relative flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm transition-all duration-150;
}

.date-picker-wrap:hover {
    border-color: rgba(25, 151, 231, 0.4);
}

.date-picker-icon {
    @apply h-4 w-4 shrink-0 text-slate-400;
}

.date-hidden-input {
    @apply absolute inset-0 cursor-pointer opacity-0;
    /* Allow the native calendar icon area to be clickable but keep the input invisible */
}

/* Time picker row - HH : MM : SS */
.time-picker-row {
    @apply flex flex-wrap items-center gap-1;
}

.time-sep {
    @apply text-sm font-semibold text-slate-400 select-none;
}

:deep(.time-dropdown-btn) {
    @apply !py-1.5 !text-center !text-sm font-mono;
    min-width: 3rem;
}
</style>
