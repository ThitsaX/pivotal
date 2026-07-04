<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Copyright 2026 ThitsaWorks -->

<script setup lang="ts">
defineProps<{
    open: boolean;
    pageSizes: readonly number[];
    currentSize: number;
}>();

const emit = defineEmits<{
    (event: 'close'): void;
    (event: 'select', value: number): void;
}>();
</script>

<template>
    <Teleport to="body">
        <div
            v-if="open"
            class="fixed inset-0 z-[82] flex items-center justify-center p-4"
        >
            <div class="absolute inset-0 bg-slate-950/45" @click="emit('close')" />
            <div class="relative w-full max-w-sm rounded-2xl border border-accent/20 bg-[#f8fbff] p-4 shadow-soft">
                <div class="mb-3 flex items-center justify-between border-b border-slate-200 pb-3">
                    <h3 class="font-display text-base text-accent">Select Page Size</h3>
                    <button
                        type="button"
                        class="rounded-lg px-2 py-1 text-slate-500 transition hover:bg-slate-100"
                        @click="emit('close')"
                    >
                        ✕
                    </button>
                </div>
                <div class="grid grid-cols-3 gap-2">
                    <button
                        v-for="size in pageSizes"
                        :key="size"
                        type="button"
                        :class="[
                            'rounded-lg border px-3 py-2 text-sm font-semibold transition',
                            currentSize === size
                                ? 'border-accent bg-accent text-white'
                                : 'border-slate-300 bg-[#fbfdff] text-ink hover:border-accent hover:text-accent',
                        ]"
                        @click="emit('select', size)"
                    >
                        {{ size }}
                    </button>
                </div>
            </div>
        </div>
    </Teleport>
</template>
