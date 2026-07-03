<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Copyright 2026 ThitsaWorks -->

<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref} from 'vue';

interface DropdownOption {
    label: string;
    value: string;
}

interface DropdownGroup {
    label: string;
    options: DropdownOption[];
}

const props = withDefaults(defineProps<{
    modelValue: string;
    options?: DropdownOption[];
    groups?: DropdownGroup[];
    placeholder?: string;
    disabled?: boolean;
    buttonClass?: string;
    menuClass?: string;
}>(), {
    options: () => [],
    groups: () => [],
    placeholder: 'Select',
    disabled: false,
    buttonClass: '',
    menuClass: '',
});

const emit = defineEmits<{
    (event: 'update:modelValue', value: string): void;
}>();

const rootRef = ref<HTMLElement | null>(null);
const open = ref(false);

const hasGroups = computed((): boolean => props.groups.length > 0);

const flatOptions = computed((): DropdownOption[] => {
    if (hasGroups.value) {
        return props.groups.flatMap((group: DropdownGroup): DropdownOption[] => group.options);
    }

    return props.options;
});

const selectedLabel = computed((): string => {
    const selected = flatOptions.value.find((option: DropdownOption): boolean => option.value === props.modelValue);

    return selected?.label ?? props.placeholder;
});

const toggle = (): void => {
    if (props.disabled) {
        return;
    }

    open.value = !open.value;
};

const selectOption = (value: string): void => {
    emit('update:modelValue', value);
    open.value = false;
};

const closeOnOutsideClick = (event: MouseEvent): void => {
    const target = event.target as Node;

    if (rootRef.value && !rootRef.value.contains(target)) {
        open.value = false;
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
            class="field-input pretty-select flex w-full items-center justify-between text-left text-xs"
            :class="buttonClass"
            :disabled="disabled"
            @click="toggle"
        >
            <span class="truncate">{{ selectedLabel }}</span>
            <svg class="h-3.5 w-3.5 shrink-0 text-slate-500 transition" :class="open ? 'rotate-180' : ''" viewBox="0 0 20 20" fill="none">
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
                class="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-accent/25 bg-white shadow-soft"
                :class="menuClass"
            >
                <ul class="max-h-64 overflow-auto py-1">
                    <template v-if="hasGroups">
                        <li v-for="group in groups" :key="`group-${group.label}`">
                            <p class="px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-accent">
                                {{ group.label }}
                            </p>
                            <button
                                v-for="option in group.options"
                                :key="`opt-${group.label}-${option.value || 'empty'}`"
                                type="button"
                                class="flex w-full items-center justify-between px-3 py-2 text-left text-xs text-ink transition hover:bg-accentSoft"
                                :class="modelValue === option.value ? 'bg-accent text-white hover:bg-accent' : ''"
                                @click="selectOption(option.value)"
                            >
                                <span class="truncate">{{ option.label }}</span>
                                <span v-if="modelValue === option.value" class="text-xs">✓</span>
                            </button>
                        </li>
                    </template>
                    <template v-else>
                        <li
                            v-for="option in options"
                            :key="`opt-${option.value || 'empty'}`"
                        >
                            <button
                                type="button"
                                class="flex w-full items-center justify-between px-3 py-2 text-left text-xs text-ink transition hover:bg-accentSoft"
                                :class="modelValue === option.value ? 'bg-accent text-white hover:bg-accent' : ''"
                                @click="selectOption(option.value)"
                            >
                                <span class="truncate">{{ option.label }}</span>
                                <span v-if="modelValue === option.value" class="text-xs">✓</span>
                            </button>
                        </li>
                    </template>
                </ul>
            </div>
        </Transition>
    </div>
</template>
