<script setup lang="ts">
import {ref, watch} from 'vue';

const props = defineProps<{
    page: number;
    totalPages: number;
    recordStart: number;
    recordEnd: number;
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
    (event: 'jump-page', value: number): void;
}>();

const pageInput = ref(String(props.page + 1));

watch(
    () => props.page,
    (page: number): void => {
        pageInput.value = String(page + 1);
    },
);

const jumpToPage = (): void => {
    const pageNumber = Number(pageInput.value);

    if (!Number.isFinite(pageNumber)) {
        return;
    }

    emit('jump-page', pageNumber);
};
</script>

<template>
    <div class="flex flex-wrap items-center gap-2 text-xs text-slate-600">
        <span class="rounded-full border border-slate-300 bg-[#fbfdff] px-3 py-1">
            Page {{ page + 1 }} / {{ totalPages }}
        </span>
        <span class="rounded-full border border-slate-300 bg-[#fbfdff] px-3 py-1">
            Showing {{ recordStart }} - {{ recordEnd }}
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
        <div class="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-[#fbfdff] px-2 py-1">
            <input
                v-model="pageInput"
                type="number"
                min="1"
                :max="totalPages"
                class="w-14 border-0 bg-transparent p-0 text-center text-xs font-semibold text-ink outline-none"
                @keydown.enter.prevent.stop="jumpToPage"
            />
            <button
                type="button"
                class="rounded-full border border-accent/25 bg-[#f8fbff] px-2 py-0.5 text-[11px] font-semibold text-accent transition hover:border-accent"
                @click.prevent.stop="jumpToPage"
            >
                Go
            </button>
        </div>
    </div>
</template>
