<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Copyright 2026 ThitsaWorks -->

<script setup lang="ts">
defineProps<{
    recordStart: number;
    recordEnd: number;
    recordStartKnown: boolean;
    pageSize: number;
    canGoPreviousPage: boolean;
    canGoNextPage: boolean;
}>();

const emit = defineEmits<{
    (event: 'open-page-size'): void;
    (event: 'first-page'): void;
    (event: 'previous-page'): void;
    (event: 'next-page'): void;
    (event: 'last-page'): void;
}>();
</script>

<template>
    <div class="flex flex-wrap items-center gap-2 text-xs text-slate-600">
        <span class="rounded-full border border-slate-300 bg-[#fbfdff] px-3 py-1">
            <template v-if="recordStartKnown">Showing {{ recordStart }} - {{ recordEnd }}</template>
            <template v-else>Showing last {{ Math.max(0, recordEnd - recordStart + 1) }}</template>
        </span>
        <button
            type="button"
            class="rounded-full border border-accent/25 bg-[#f8fbff] px-3 py-1 font-semibold text-accent transition hover:border-accent"
            @click="emit('open-page-size')"
        >
            Size: {{ pageSize }}
        </button>
        <button
            type="button"
            class="rounded-full border border-slate-300 bg-[#fbfdff] px-3 py-1 font-semibold transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
            :disabled="!canGoPreviousPage"
            @click="emit('first-page')"
        >
            First
        </button>
        <button
            type="button"
            class="rounded-full border border-slate-300 bg-[#fbfdff] px-3 py-1 font-semibold transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
            :disabled="!canGoPreviousPage"
            @click="emit('previous-page')"
        >
            Prev
        </button>
        <button
            type="button"
            class="rounded-full border border-slate-300 bg-[#fbfdff] px-3 py-1 font-semibold transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
            :disabled="!canGoNextPage"
            @click="emit('next-page')"
        >
            Next
        </button>
        <button
            type="button"
            class="rounded-full border border-slate-300 bg-[#fbfdff] px-3 py-1 font-semibold transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
            :disabled="!canGoNextPage"
            @click="emit('last-page')"
        >
            Last
        </button>
    </div>
</template>
