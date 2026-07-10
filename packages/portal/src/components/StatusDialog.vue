<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Copyright 2024-2026 ThitsaWorks Pte. Ltd. -->

<script setup lang="ts">
import {computed} from 'vue';

const props = withDefaults(defineProps<{
    open: boolean;
    tone?: 'error' | 'success';
    eyebrow: string;
    title: string;
    message: string | null;
    closeLabel?: string;
    maxWidthClass?: string;
}>(), {
    tone: 'error',
    closeLabel: 'Close',
    maxWidthClass: 'max-w-lg',
});

const emit = defineEmits<{
    (event: 'close'): void;
}>();

const shellClass = computed((): string => {
    return props.tone === 'error'
        ? 'border-red-200 bg-white'
        : 'border-emerald-200 bg-white';
});

const headerClass = computed((): string => {
    return props.tone === 'error'
        ? 'border-red-100 bg-red-50'
        : 'border-emerald-100 bg-emerald-50';
});

const eyebrowClass = computed((): string => {
    return props.tone === 'error' ? 'text-red-700' : 'text-emerald-700';
});

const iconClass = computed((): string => {
    return props.tone === 'error'
        ? 'border-red-200 bg-white text-red-600'
        : 'border-emerald-200 bg-white text-emerald-600';
});

const closeButtonClass = computed((): string => {
    return props.tone === 'error'
        ? 'hover:bg-white hover:text-red-600'
        : 'hover:bg-white hover:text-emerald-600';
});

const actionButtonClass = computed((): string => {
    return props.tone === 'error'
        ? 'bg-red-600 hover:bg-red-700'
        : 'bg-emerald-600 hover:bg-emerald-700';
});
</script>

<template>
    <Teleport to="body">
        <div
            v-if="open"
            class="fixed inset-0 z-[90] flex items-center justify-center p-4"
        >
            <div class="absolute inset-0 bg-slate-950/45" @click="emit('close')" />

            <article :class="['relative w-full rounded-2xl border shadow-[0_24px_60px_rgba(15,23,42,0.25)]', maxWidthClass, shellClass]">
                <div :class="['flex items-start gap-4 border-b px-5 py-4', headerClass]">
                    <span :class="['inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border', iconClass]">
                        <svg
                            v-if="tone === 'error'"
                            class="h-5 w-5"
                            viewBox="0 0 20 20"
                            fill="none"
                            aria-hidden="true"
                        >
                            <path d="M10 6.5V10.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
                            <circle cx="10" cy="13.6" r="0.9" fill="currentColor" />
                            <path d="M8.7 3.2 2.9 13.1a1.5 1.5 0 0 0 1.3 2.2h11.6a1.5 1.5 0 0 0 1.3-2.2L11.3 3.2a1.5 1.5 0 0 0-2.6 0Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
                        </svg>
                        <svg
                            v-else
                            class="h-5 w-5"
                            viewBox="0 0 20 20"
                            fill="none"
                            aria-hidden="true"
                        >
                            <path d="M5 10.3 8.4 13.7 15 7.1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                            <circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="1.5" />
                        </svg>
                    </span>

                    <div class="min-w-0 flex-1">
                        <p :class="['text-xs font-semibold uppercase tracking-[0.14em]', eyebrowClass]">
                            {{ eyebrow }}
                        </p>
                        <h4 class="mt-1 font-display text-lg text-slate-900">
                            {{ title }}
                        </h4>
                    </div>

                    <button
                        type="button"
                        :class="['rounded-lg px-2 py-1 text-slate-500 transition', closeButtonClass]"
                        @click="emit('close')"
                    >
                        ✕
                    </button>
                </div>

                <div class="space-y-3 px-5 py-4">
                    <p class="text-sm leading-6 text-slate-700">
                        {{ message }}
                    </p>

                    <slot />
                </div>

                <div class="flex justify-end border-t border-slate-200 px-5 py-4">
                    <button
                        type="button"
                        :class="['rounded-xl px-4 py-2 text-sm font-semibold text-white transition', actionButtonClass]"
                        @click="emit('close')"
                    >
                        {{ closeLabel }}
                    </button>
                </div>
            </article>
        </div>
    </Teleport>
</template>
