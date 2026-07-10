<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Copyright 2024-2026 ThitsaWorks Pte. Ltd. -->

<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref} from 'vue';

const props = defineProps<{
    modelValue: string;
    compact?: boolean;
}>();

const emit = defineEmits<{
    (event: 'update:modelValue', value: string): void;
}>();

const rootRef = ref<HTMLElement | null>(null);
const searchQuery = ref('');
const open = ref(false);

const FALLBACK_TIME_ZONES = [
    'UTC',
    'Asia/Rangoon',
    'Asia/Singapore',
    'Asia/Bangkok',
    'Europe/London',
    'America/New_York',
    'America/Chicago',
    'America/Los_Angeles',
    'Australia/Sydney',
];

const allTimeZones = computed((): string[] => {
    const supportedValuesOf = (Intl as unknown as {supportedValuesOf?: (key: string) => string[]}).supportedValuesOf;

    if (typeof supportedValuesOf === 'function') {
        return supportedValuesOf('timeZone');
    }

    return FALLBACK_TIME_ZONES;
});

// Current UTC offset of a zone, in minutes (e.g. GMT+05:30 → 330). Used to order the
// list from GMT-12 → GMT+14 instead of alphabetically.
const zoneOffsetMinutes = (timeZone: string): number => {
    try {
        const zonePart = new Intl.DateTimeFormat('en-US', {
            timeZone,
            timeZoneName: 'shortOffset',
        }).formatToParts(new Date())
            .find((part: Intl.DateTimeFormatPart): boolean => part.type === 'timeZoneName')?.value ?? 'GMT+00:00';

        const matches = zonePart.match(/GMT([+\-])(\d{1,2})(?::?(\d{2}))?/i);

        if (!matches) {
            return 0;
        }

        const sign = matches[1] === '-' ? -1 : 1;

        return sign * (Number(matches[2]) * 60 + Number(matches[3] ?? '0'));
    } catch {
        return 0;
    }
};

// Cache the offset for every zone once (not per keystroke) so sorting the filtered
// list is a cheap Map lookup.
const offsetByZone = computed((): Map<string, number> => {
    const map = new Map<string, number>();

    for (const timeZone of allTimeZones.value) {
        map.set(timeZone, zoneOffsetMinutes(timeZone));
    }

    return map;
});

const byOffsetThenName = (
    left: {label: string; value: string},
    right: {label: string; value: string},
): number => {
    const diff = (offsetByZone.value.get(left.value) ?? 0) - (offsetByZone.value.get(right.value) ?? 0);

    return diff !== 0 ? diff : left.label.localeCompare(right.label);
};

const quickTimeZones = computed((): string[] => {
    const preferred = [
        'UTC',
        'Asia/Rangoon',
        'Asia/Singapore',
        'Asia/Bangkok',
        'Europe/London',
        'America/New_York',
        'America/Chicago',
        'America/Los_Angeles',
    ];

    return preferred.filter((timeZone: string): boolean => allTimeZones.value.includes(timeZone));
});

const normalizeText = (value: string): string => {
    return value.toLowerCase().replace(/_/g, ' ');
};

const groupedTimeZones = computed((): Array<{label: string; options: Array<{label: string; value: string}>}> => {
    const normalizedQuery = normalizeText(searchQuery.value.trim());
    const includesQuery = (timeZone: string): boolean => {
        if (normalizedQuery === '') {
            return true;
        }

        return normalizeText(timeZone).includes(normalizedQuery);
    };

    const commonOptions = quickTimeZones.value
        .filter((timeZone: string): boolean => includesQuery(timeZone))
        .map((timeZone: string): {label: string; value: string} => ({label: timeZone, value: timeZone}))
        .sort(byOffsetThenName);

    const commonValues = new Set(commonOptions.map((option): string => option.value));
    const allOptions = allTimeZones.value
        .filter((timeZone: string): boolean => includesQuery(timeZone) && !commonValues.has(timeZone))
        .map((timeZone: string): {label: string; value: string} => ({label: timeZone, value: timeZone}))
        .sort(byOffsetThenName);

    return [
        {
            label: 'Common',
            options: commonOptions,
        },
        {
            label: 'All Time Zones',
            options: allOptions,
        },
    ].filter((group): boolean => group.options.length > 0);
});

const selectedOffset = computed((): string => {
    try {
        const value = new Intl.DateTimeFormat('en-US', {
            timeZone: props.modelValue,
            timeZoneName: 'shortOffset',
        }).formatToParts(new Date())
            .find((part: Intl.DateTimeFormatPart): boolean => part.type === 'timeZoneName')
            ?.value ?? '';

        return value.replace('GMT', 'UTC');
    } catch {
        return 'UTC';
    }
});

const selectedRegion = computed((): string => {
    if (props.modelValue === 'UTC') {
        return 'Universal Time';
    }

    const segments = props.modelValue.split('/');

    return segments[segments.length - 1]?.replace(/_/g, ' ') ?? props.modelValue;
});

const selectedLocalTime = computed((): string => {
    try {
        return new Intl.DateTimeFormat('en-GB', {
            timeZone: props.modelValue,
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        }).format(new Date());
    } catch {
        return '';
    }
});

const toggle = (): void => {
    open.value = !open.value;

    if (open.value) {
        searchQuery.value = '';
    }
};

const close = (): void => {
    open.value = false;
};

const selectTimeZone = (value: string): void => {
    emit('update:modelValue', value);
    searchQuery.value = '';
    close();
};

const handleOutsideClick = (event: MouseEvent): void => {
    const target = event.target as Node;

    if (rootRef.value != null && !rootRef.value.contains(target)) {
        close();
    }
};

onMounted((): void => {
    document.addEventListener('mousedown', handleOutsideClick);
});

onBeforeUnmount((): void => {
    document.removeEventListener('mousedown', handleOutsideClick);
});
</script>

<template>
    <div
        ref="rootRef"
        :class="[
            'relative',
            props.compact
                ? 'w-full sm:min-w-[12rem] lg:min-w-[13rem] lg:w-auto'
                : 'w-full sm:min-w-[15rem] lg:min-w-[17rem] lg:w-auto',
        ]"
    >
        <button
            type="button"
            :class="[
                'flex w-full items-center text-left transition hover:border-accent/35',
                props.compact
                    ? 'gap-1.5 rounded-lg border border-accent/16 bg-white/88 px-2 py-1.5 shadow-[0_8px_18px_rgba(20,127,195,0.07)] hover:shadow-[0_10px_22px_rgba(20,127,195,0.10)]'
                    : 'gap-2 rounded-xl border border-accent/18 bg-white/92 px-2.5 py-2 shadow-[0_10px_24px_rgba(20,127,195,0.08)] hover:shadow-[0_12px_28px_rgba(20,127,195,0.12)]',
            ]"
            @click="toggle"
        >
            <span
                :class="[
                    'inline-flex shrink-0 items-center justify-center border border-accent/15 bg-[#f4faff] text-accent shadow-insetSoft',
                    props.compact ? 'h-7 w-7 rounded-lg' : 'h-11 w-11 rounded-2xl',
                ]"
            >
                <svg :class="props.compact ? 'h-3.5 w-3.5' : 'h-4 w-4'" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.6" />
                    <path d="M3.5 12h17" stroke="currentColor" stroke-width="1.3" />
                    <path d="M12 3.5c2.6 2.3 3.8 5.2 3.8 8.5S14.6 18.2 12 20.5c-2.6-2.3-3.8-5.2-3.8-8.5S9.4 5.8 12 3.5Z" stroke="currentColor" stroke-width="1.3" />
                    <circle cx="18.8" cy="5.2" r="1.8" fill="#f15a24" />
                </svg>
            </span>

            <span class="min-w-0 flex-1">
                <span :class="['block truncate text-ink', props.compact ? 'mt-0 font-body text-xs font-semibold leading-4' : 'mt-0 font-body text-sm font-semibold leading-5']">
                    {{ modelValue }}
                </span>
            </span>

            <span :class="['flex shrink-0 flex-col items-end', props.compact ? 'gap-0.5' : 'gap-0.5']">
                <span :class="['inline-flex rounded-full border border-accent/20 bg-[#f8fbff] font-semibold uppercase tracking-[0.08em] text-accent', props.compact ? 'px-1.5 py-0 text-[8px]' : 'px-2 py-0.5 text-[9px]']">
                    {{ selectedOffset }}
                </span>
                <span :class="props.compact ? 'text-[9px] text-slate-500' : 'text-[10px] text-slate-500'">
                    {{ selectedLocalTime }}
                </span>
            </span>

            <svg
                :class="[
                    props.compact ? 'h-3.5 w-3.5 shrink-0 text-slate-500 transition' : 'h-3.5 w-3.5 shrink-0 text-slate-500 transition',
                    open ? 'rotate-180 text-accent' : '',
                ]"
                viewBox="0 0 20 20"
                fill="none"
                aria-hidden="true"
            >
                <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
        </button>

        <Transition
            enter-active-class="transition duration-150 ease-out"
            enter-from-class="translate-y-1 opacity-0"
            enter-to-class="translate-y-0 opacity-100"
            leave-active-class="transition duration-120 ease-in"
            leave-from-class="translate-y-0 opacity-100"
            leave-to-class="translate-y-1 opacity-0"
        >
            <div
                v-if="open"
                :class="[
                    'absolute right-0 z-50 mt-2 min-w-full overflow-hidden border border-accent/20 bg-white shadow-[0_22px_50px_rgba(20,127,195,0.16)]',
                    props.compact ? 'w-[min(24rem,calc(100vw-1.5rem))]' : 'w-[min(26rem,calc(100vw-2rem))]',
                    props.compact ? 'rounded-xl' : 'rounded-2xl',
                ]"
                @mousedown.stop
                @click.stop
            >
                <div class="border-b border-accent/10 bg-[#f8fbff] p-3">
                    <label for="time-zone-search" class="sr-only">Search Time Zone</label>
                    <div class="flex items-center gap-2 rounded-xl border border-accent/15 bg-white px-3 py-2 shadow-insetSoft">
                        <svg class="h-4 w-4 shrink-0 text-slate-400" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.8" />
                            <path d="M20 20L17 17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
                        </svg>
                        <input
                            id="time-zone-search"
                            v-model="searchQuery"
                            type="text"
                            class="w-full border-0 bg-transparent p-0 text-sm text-ink outline-none placeholder:text-slate-400"
                            placeholder="Search time zone"
                        />
                    </div>
                </div>

                <div
                    class="portal-scrollbar max-h-[20rem] overflow-y-scroll overscroll-contain px-2 py-2 pr-1"
                    @touchmove.stop
                    @mousedown.stop
                >
                    <template v-if="groupedTimeZones.length > 0">
                        <section
                            v-for="group in groupedTimeZones"
                            :key="group.label"
                            class="pb-2"
                        >
                            <div class="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-accent">
                                {{ group.label }}
                            </div>

                            <button
                                v-for="option in group.options"
                                :key="option.value"
                                type="button"
                                class="flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition hover:bg-[#f5faff]"
                                :class="option.value === modelValue ? 'bg-[#edf7ff]' : ''"
                                @click="selectTimeZone(option.value)"
                            >
                                <span
                                    class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border text-[11px] font-semibold"
                                    :class="option.value === modelValue ? 'border-accent/20 bg-white text-accent' : 'border-slate-200 bg-slate-50 text-slate-500'"
                                >
                                    {{ option.value.slice(0, 2).toUpperCase() }}
                                </span>

                                <span class="min-w-0 flex-1">
                                    <span class="block truncate text-sm font-semibold text-ink">
                                        {{ option.label }}
                                    </span>
                                    <span class="block truncate text-[11px] text-slate-500">
                                        {{
                                            option.value === 'UTC'
                                                ? 'Universal Time'
                                                : option.value.split('/').slice(-1)[0]?.replace(/_/g, ' ')
                                        }}
                                    </span>
                                </span>

                                <span
                                    class="inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]"
                                    :class="option.value === modelValue ? 'border-accent/20 bg-white text-accent' : 'border-slate-200 bg-slate-50 text-slate-500'"
                                >
                                    {{
                                        new Intl.DateTimeFormat('en-US', {
                                            timeZone: option.value,
                                            timeZoneName: 'shortOffset',
                                        }).formatToParts(new Date())
                                            .find((part: Intl.DateTimeFormatPart): boolean => part.type === 'timeZoneName')
                                            ?.value
                                            ?.replace('GMT', 'UTC') ?? 'UTC'
                                    }}
                                </span>
                            </button>
                        </section>
                    </template>

                    <div v-else class="px-3 py-6 text-center text-sm text-slate-500">
                        No time zones matched that search.
                    </div>
                </div>
            </div>
        </Transition>
    </div>
</template>
