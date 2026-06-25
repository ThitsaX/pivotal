<script setup lang="ts">
import CustomDropdown from './CustomDropdown.vue';
import TimeRangeSelector from './TimeRangeSelector.vue';
import type {CriteriaSection} from '../modules/audit/types';

const props = withDefaults(defineProps<{
    sections: CriteriaSection[];
    criteria: Record<string, string>;
    selectedTimeZone: string;
    visible: boolean;
    loading: boolean;
    lastLoadedAt: string | null;
    formatLastLoadedAt: (value: string) => string;
    exclusiveFieldKey?: string | null;
    embedded?: boolean;
}>(), {
    exclusiveFieldKey: null,
    embedded: false,
});

const emit = defineEmits<{
    (event: 'toggle'): void;
    (event: 'submit'): void;
    (event: 'reset'): void;
    (event: 'refresh'): void;
}>();

const getSectionClass = (sectionKey: string): string => {
    if (sectionKey === 'status' || sectionKey === 'participant') {
        return 'xl:col-span-3';
    }

    if (sectionKey === 'transaction' || sectionKey === 'parties' || sectionKey === 'transactionPeriod') {
        return 'xl:col-span-6';
    }

    return '';
};

const getFieldGridClass = (sectionKey: string): string => {
    if (sectionKey === 'participant' || sectionKey === 'status') {
        return 'grid gap-3 sm:grid-cols-2';
    }

    if (sectionKey === 'transaction') {
        return 'grid gap-3 sm:grid-cols-2 xl:grid-cols-4';
    }

    if (sectionKey === 'parties') {
        return 'grid gap-3 sm:grid-cols-2 xl:grid-cols-3';
    }

    return 'grid gap-3 sm:grid-cols-2 xl:grid-cols-4';
};

const isFieldDisabled = (fieldKey: string): boolean => {
    return props.exclusiveFieldKey != null && props.exclusiveFieldKey !== fieldKey;
};

const isTimeRangeDisabled = (): boolean => {
    return props.exclusiveFieldKey != null;
};
</script>

<template>
    <section :class="props.embedded ? 'pt-0' : 'pt-5'">
        <article class="overflow-visible border border-accent/20 bg-white shadow-[0_18px_40px_rgba(20,127,195,0.08)]">
            <div class="flex flex-col gap-3 border-b border-accent/15 bg-[#f8fbff] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h3 class="font-display text-sm font-semibold uppercase tracking-[0.08em] text-accent">
                        Search Criteria
                    </h3>
                    <p class="mt-0.5 text-xs text-slate-500">
                        Refine the query and run search against audit data.
                    </p>
                </div>
                <div class="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                    <button
                        v-if="!visible"
                        type="button"
                        class="inline-flex min-w-[9rem] items-center justify-center gap-1.5 rounded-lg border border-accent/25 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-accent transition hover:border-accent hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-100 disabled:text-slate-400 sm:min-w-0"
                        :disabled="loading"
                        @click="emit('refresh')"
                    >
                        <svg class="h-3.5 w-3.5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                            <path d="M16.667 10A6.667 6.667 0 1 1 14.714 5.286" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
                            <path d="M16.667 3.333V6.667H13.333" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
                        </svg>
                        Refresh
                    </button>

                    <button
                        type="button"
                        :class="[
                            'inline-flex min-w-[9rem] items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] transition sm:min-w-0',
                            visible
                                ? 'border border-accent/25 bg-white text-accent hover:border-accent'
                                : 'animate-pulseGlow border border-accent bg-accent text-white shadow-soft',
                        ]"
                        :title="visible ? 'Hide search form' : 'Show search form'"
                        @click="emit('toggle')"
                    >
                        <svg
                            v-if="visible"
                            class="h-3.5 w-3.5"
                            viewBox="0 0 20 20"
                            fill="none"
                            aria-hidden="true"
                        >
                            <path d="M2.5 10S5.5 4.5 10 4.5 17.5 10 17.5 10 14.5 15.5 10 15.5 2.5 10 2.5 10Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" />
                            <circle cx="10" cy="10" r="2.2" stroke="currentColor" stroke-width="1.7" />
                            <path d="M4 16L16 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
                        </svg>
                        <svg
                            v-else
                            class="h-3.5 w-3.5"
                            viewBox="0 0 20 20"
                            fill="none"
                            aria-hidden="true"
                        >
                            <path d="M2.5 10S5.5 4.5 10 4.5 17.5 10 17.5 10 14.5 15.5 10 15.5 2.5 10 2.5 10Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" />
                            <circle cx="10" cy="10" r="2.2" stroke="currentColor" stroke-width="1.7" />
                        </svg>
                        <span>{{ visible ? 'Hide' : 'Show' }}</span>
                    </button>
                </div>
            </div>

            <Transition
                enter-active-class="transition-all duration-250 ease-out"
                enter-from-class="max-h-0 -translate-y-1 opacity-0"
                enter-to-class="max-h-[1600px] translate-y-0 opacity-100"
                leave-active-class="overflow-hidden transition-all duration-250 ease-in"
                leave-from-class="max-h-[1600px] translate-y-0 opacity-100"
                leave-to-class="max-h-0 -translate-y-1 opacity-0"
            >
                <form v-show="visible" class="space-y-4 px-4 py-4" @submit.prevent="emit('submit')">
                    <div class="grid gap-4 xl:grid-cols-6">
                        <section
                            v-for="section in sections"
                            :key="section.key"
                            :class="[
                                'space-y-2.5 rounded-xl border border-accent/20 bg-[#fafdff] px-3 py-2.5',
                                getSectionClass(section.key),
                            ]"
                        >
                            <h3 class="text-xs font-bold uppercase tracking-[0.1em] text-[#147fc3]">
                                {{ section.title }}
                            </h3>

                            <div v-if="section.key === 'transactionPeriod'" class="grid gap-4 xl:grid-cols-2">
                                <TimeRangeSelector
                                    label="Transaction Start"
                                    :selected-time-zone="selectedTimeZone"
                                    :mode="criteria.transactionStartAtMode"
                                    :start-value="criteria.transactionStartAtStart"
                                    :end-value="criteria.transactionStartAtEnd"
                                    :disabled="isTimeRangeDisabled()"
                                    @update:mode="criteria.transactionStartAtMode = $event"
                                    @update:start-value="criteria.transactionStartAtStart = $event"
                                    @update:end-value="criteria.transactionStartAtEnd = $event"
                                />
                            </div>

                            <div v-else :class="getFieldGridClass(section.key)">
                                <div
                                    v-for="field in section.fields"
                                    :key="field.key"
                                    class="block"
                                >
                                    <div class="relative">
                                        <span class="pointer-events-none absolute left-3 top-1.5 z-10 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                                            {{ field.label }}
                                        </span>

                                        <input
                                            v-if="field.type === 'text'"
                                            v-model="criteria[field.key]"
                                            type="text"
                                            class="field-input !pb-1.5 !pt-5 text-xs"
                                            :disabled="isFieldDisabled(field.key)"
                                            :placeholder="field.placeholder ?? field.label"
                                        />

                                        <input
                                            v-else-if="field.type === 'datetime'"
                                            v-model="criteria[field.key]"
                                            type="datetime-local"
                                            class="field-input !pb-1.5 !pt-5 text-xs"
                                            :disabled="isFieldDisabled(field.key)"
                                        />

                                        <CustomDropdown
                                            v-else
                                            v-model="criteria[field.key]"
                                            :options="field.options ?? []"
                                            :placeholder="field.label"
                                            button-class="!pb-1.5 !pt-5 text-xs"
                                            :disabled="isFieldDisabled(field.key)"
                                        />
                                    </div>
                                </div>
                            </div>
                        </section>
                    </div>

                    <div class="flex flex-wrap items-center gap-2.5 border-t border-slate-200 pt-2.5">
                        <button
                            type="submit"
                            class="inline-flex items-center gap-2 rounded-lg bg-accent px-3.5 py-2 font-display text-xs font-semibold text-white transition hover:bg-[#1289d8] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-white"
                            :disabled="loading"
                        >
                            <span
                                class="inline-block h-2.5 w-2.5 rounded-full bg-accentWarm"
                                :class="loading ? 'animate-pulseGlow' : ''"
                            />
                            {{ loading ? 'Searching...' : 'Find Transactions' }}
                        </button>

                        <button
                            type="button"
                            class="rounded-lg border border-accent/25 bg-[#f8fbff] px-3.5 py-2 text-xs font-semibold text-ink transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-100 disabled:text-slate-400"
                            @click="emit('reset')"
                        >
                            Reset
                        </button>

                        <p v-if="lastLoadedAt" class="text-xs text-muted">
                            Last loaded at {{ formatLastLoadedAt(lastLoadedAt) }}
                        </p>
                    </div>
                </form>
            </Transition>
        </article>
    </section>
</template>
