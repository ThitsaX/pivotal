<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Copyright 2024-2026 ThitsaWorks Pte. Ltd. -->

<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref} from 'vue';

interface CurrencyOption {
    label: string;
    value: string;
}

const props = withDefaults(defineProps<{
    modelValue: string;
    options?: CurrencyOption[];
    placeholder?: string;
    disabled?: boolean;
    buttonClass?: string;
    menuClass?: string;
}>(), {
    options: () => [],
    placeholder: 'Select currency',
    disabled: false,
    buttonClass: '',
    menuClass: '',
});

const emit = defineEmits<{
    (event: 'update:modelValue', value: string): void;
}>();

const rootRef = ref<HTMLElement | null>(null);
const open = ref(false);
const searchQuery = ref('');

const currencyDisplayNames = computed((): {of: (value: string) => string | undefined} | null => {
    const intlWithDisplayNames = Intl as typeof Intl & {
        DisplayNames?: new (
            locales?: string | string[],
            options?: {type: string},
        ) => {of: (value: string) => string | undefined};
    };

    if (typeof intlWithDisplayNames.DisplayNames !== 'function') {
        return null;
    }

    return new intlWithDisplayNames.DisplayNames(['en'], {
        type: 'currency',
    });
});

const resolveCurrencyName = (value: string): string => {
    try {
        return currencyDisplayNames.value?.of(value) ?? value;
    } catch {
        return value;
    }
};

const selectedOption = computed((): CurrencyOption | undefined => {
    return props.options.find((option: CurrencyOption): boolean => option.value === props.modelValue);
});

const selectedLabel = computed((): string => {
    return selectedOption.value?.label ?? props.placeholder;
});

const selectedCurrencyName = computed((): string => {
    if (selectedOption.value == null) {
        return '';
    }

    return resolveCurrencyName(selectedOption.value.value);
});

const filteredOptions = computed((): Array<CurrencyOption & {displayName: string}> => {
    const normalizedQuery = searchQuery.value.trim().toLowerCase();

    return props.options
        .map((option: CurrencyOption): CurrencyOption & {displayName: string} => ({
            ...option,
            displayName: resolveCurrencyName(option.value),
        }))
        .filter((option: CurrencyOption & {displayName: string}): boolean => {
            if (normalizedQuery.length === 0) {
                return true;
            }

            return option.value.toLowerCase().includes(normalizedQuery)
                || option.label.toLowerCase().includes(normalizedQuery)
                || option.displayName.toLowerCase().includes(normalizedQuery);
        });
});

const openMenu = (): void => {
    if (props.disabled) {
        return;
    }

    open.value = true;
    searchQuery.value = '';
};

const toggle = (): void => {
    if (open.value) {
        open.value = false;

        return;
    }

    openMenu();
};

const close = (): void => {
    open.value = false;
};

const selectOption = (value: string): void => {
    emit('update:modelValue', value);
    searchQuery.value = '';
    close();
};

const closeOnOutsideClick = (event: MouseEvent): void => {
    const target = event.target as Node;

    if (rootRef.value != null && !rootRef.value.contains(target)) {
        close();
    }
};

onMounted((): void => {
    document.addEventListener('mousedown', closeOnOutsideClick);
});

onBeforeUnmount((): void => {
    document.removeEventListener('mousedown', closeOnOutsideClick);
});
</script>

<template>
    <div ref="rootRef" class="relative">
        <button
            type="button"
            class="field-input pretty-select flex w-full items-center justify-between text-left text-xs transition hover:border-accent/35"
            :class="buttonClass"
            :disabled="disabled"
            @click="toggle"
        >
            <span class="min-w-0 flex-1">
                <span class="block truncate text-ink">
                    {{ selectedLabel }}
                </span>
                <span
                    v-if="selectedOption != null"
                    class="mt-0.5 block truncate text-[10px] text-slate-500"
                >
                    {{ selectedCurrencyName }}
                </span>
            </span>

            <svg
                class="h-3.5 w-3.5 shrink-0 text-slate-500 transition"
                :class="open ? 'rotate-180 text-accent' : ''"
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
                class="absolute right-0 z-50 mt-2 min-w-full overflow-hidden rounded-xl border border-accent/20 bg-white shadow-[0_22px_50px_rgba(20,127,195,0.16)]"
                :class="['w-[min(24rem,calc(100vw-2rem))]', menuClass]"
                @mousedown.stop
                @click.stop
            >
                <div class="border-b border-accent/10 bg-[#f8fbff] p-3">
                    <label for="currency-search" class="sr-only">Search Currency</label>
                    <div class="flex items-center gap-2 rounded-xl border border-accent/15 bg-white px-3 py-2 shadow-insetSoft">
                        <svg class="h-4 w-4 shrink-0 text-slate-400" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.8" />
                            <path d="M20 20L17 17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
                        </svg>
                        <input
                            id="currency-search"
                            v-model="searchQuery"
                            type="text"
                            class="w-full border-0 bg-transparent p-0 text-sm text-ink outline-none placeholder:text-slate-400"
                            placeholder="Search currency"
                        />
                    </div>
                </div>

                <div class="portal-scrollbar max-h-[20rem] overflow-y-scroll overscroll-contain px-2 py-2 pr-1">
                    <div class="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-accent">
                        Currency
                    </div>

                    <template v-if="filteredOptions.length > 0">
                        <button
                            v-for="option in filteredOptions"
                            :key="option.value"
                            type="button"
                            class="flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition hover:bg-[#f5faff]"
                            :class="option.value === modelValue ? 'bg-[#edf7ff]' : ''"
                            @click="selectOption(option.value)"
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
                                    {{ option.displayName }}
                                </span>
                            </span>

                            <span
                                class="inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]"
                                :class="option.value === modelValue ? 'border-accent/20 bg-white text-accent' : 'border-slate-200 bg-slate-50 text-slate-500'"
                            >
                                {{ option.value }}
                            </span>
                        </button>
                    </template>

                    <div v-else class="px-3 py-6 text-center text-sm text-slate-500">
                        No currencies matched that search.
                    </div>
                </div>
            </div>
        </Transition>
    </div>
</template>
