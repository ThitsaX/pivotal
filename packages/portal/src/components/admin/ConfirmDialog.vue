<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Copyright 2024-2026 ThitsaWorks Pte. Ltd. -->

<script setup lang="ts">
import {computed, ref, watch} from 'vue';

const props = defineProps<{
    open:            boolean;
    title:           string;
    message:         string;
    /** When set, the user must type this exact value (e.g. the user's email) to enable the confirm button. */
    confirmToken?:   string;
    confirmLabel?:   string;
    cancelLabel?:    string;
    busy?:           boolean;
    /** Visual tone of the confirm button. */
    tone?:           'danger' | 'primary';
    errorMessage?:   string | null;
}>();

const emit = defineEmits<{
    confirm: [];
    cancel:  [];
}>();

const typed = ref('');

watch(() => props.open, (open) => {
    if (!open) {
        typed.value = '';
    }
});

const canConfirm = computed((): boolean => {

    if (props.busy === true) {
        return false;
    }

    if (props.confirmToken == null) {
        return true;
    }

    return typed.value === props.confirmToken;
});

const confirmToneClass = computed((): string => {

    if (props.tone === 'primary') {
        return 'bg-accent hover:bg-accent/90';
    }

    return 'bg-red-600 hover:bg-red-700';
});
</script>

<template>
    <Teleport to="body">
        <div
            v-if="open"
            class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
            role="dialog"
            aria-modal="true"
        >
            <div class="w-full max-w-md rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-soft">
                <h2 class="text-base font-semibold text-ink">{{ title }}</h2>
                <p class="mt-2 text-sm text-slate-600">{{ message }}</p>

                <div v-if="confirmToken != null" class="mt-4">
                    <label class="block text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">
                        Type <span class="font-mono normal-case text-ink">{{ confirmToken }}</span> to confirm
                    </label>
                    <input
                        v-model="typed"
                        type="text"
                        autocomplete="off"
                        class="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                    >
                </div>

                <div
                    v-if="errorMessage != null"
                    class="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
                    role="alert"
                >
                    {{ errorMessage }}
                </div>

                <div class="mt-5 flex justify-end gap-2">
                    <button
                        type="button"
                        class="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-ink transition hover:bg-slate-50"
                        :disabled="busy === true"
                        @click="emit('cancel')"
                    >
                        {{ cancelLabel ?? 'Cancel' }}
                    </button>
                    <button
                        type="button"
                        :class="[
                            'rounded-lg px-3 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50',
                            confirmToneClass,
                        ]"
                        :disabled="!canConfirm"
                        @click="emit('confirm')"
                    >
                        {{ busy === true ? 'Working…' : (confirmLabel ?? 'Confirm') }}
                    </button>
                </div>
            </div>
        </div>
    </Teleport>
</template>
