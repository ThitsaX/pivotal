<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Copyright 2024-2026 ThitsaWorks Pte. Ltd. -->

<script setup lang="ts" generic="T extends {id: string}">
import {computed} from 'vue';

interface AdminColumn {
    key:     string;
    label:   string;
    width?:  string;
    align?:  'left' | 'right' | 'center';
}

const props = defineProps<{
    columns:    AdminColumn[];
    rows:       readonly T[];
    loading?:   boolean;
    error?:     string | null;
    emptyText?: string;
    total?:     number;
    page?:      number;
    pageSize?:  number;
}>();

defineSlots<{
    cell(props: {row: T; column: AdminColumn}): unknown;
    actions?(props: {row: T}): unknown;
}>();

const lastPage = computed((): number => {
    if (props.total == null || props.pageSize == null || props.pageSize <= 0) {
        return 1;
    }
    return Math.max(1, Math.ceil(props.total / props.pageSize));
});

const emit = defineEmits<{
    'page-change': [page: number];
}>();
</script>

<template>
    <div class="rounded-2xl border border-slate-200 bg-white shadow-soft">
        <div
            v-if="error != null"
            class="rounded-t-2xl border-b border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700"
            role="alert"
        >
            {{ error }}
        </div>

        <div class="overflow-x-auto">
            <table class="min-w-full table-auto text-sm">
                <thead>
                    <tr class="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                        <th
                            v-for="col in columns"
                            :key="col.key"
                            :style="col.width != null ? {width: col.width} : undefined"
                            :class="[
                                'px-4 py-3',
                                col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left',
                            ]"
                        >
                            {{ col.label }}
                        </th>
                        <th v-if="$slots.actions" class="px-4 py-3 text-right">
                            Actions
                        </th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-if="loading">
                        <td
                            :colspan="columns.length + ($slots.actions ? 1 : 0)"
                            class="px-4 py-8 text-center text-sm text-slate-500"
                        >
                            Loading…
                        </td>
                    </tr>
                    <tr v-else-if="rows.length === 0">
                        <td
                            :colspan="columns.length + ($slots.actions ? 1 : 0)"
                            class="px-4 py-8 text-center text-sm text-slate-500"
                        >
                            {{ emptyText ?? 'No results.' }}
                        </td>
                    </tr>
                    <tr
                        v-for="row in rows"
                        v-else
                        :key="row.id"
                        class="border-b border-slate-100 transition hover:bg-slate-50/60"
                    >
                        <td
                            v-for="col in columns"
                            :key="col.key"
                            :class="[
                                'px-4 py-3 align-middle text-ink',
                                col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left',
                            ]"
                        >
                            <slot name="cell" :row="row" :column="col" />
                        </td>
                        <td v-if="$slots.actions" class="px-4 py-3 text-right">
                            <slot name="actions" :row="row" />
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>

        <div
            v-if="total != null && pageSize != null && page != null"
            class="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-xs text-slate-500"
        >
            <span>
                {{ total === 0 ? '0' : ((page - 1) * pageSize + 1) }}–{{ Math.min(page * pageSize, total) }} of {{ total }}
            </span>
            <div class="flex gap-2">
                <button
                    type="button"
                    class="rounded-md border border-slate-300 px-2 py-1 font-medium text-ink transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
                    :disabled="page <= 1"
                    @click="emit('page-change', page - 1)"
                >
                    Previous
                </button>
                <span class="self-center text-slate-500">Page {{ page }} of {{ lastPage }}</span>
                <button
                    type="button"
                    class="rounded-md border border-slate-300 px-2 py-1 font-medium text-ink transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
                    :disabled="page >= lastPage"
                    @click="emit('page-change', page + 1)"
                >
                    Next
                </button>
            </div>
        </div>
    </div>
</template>
