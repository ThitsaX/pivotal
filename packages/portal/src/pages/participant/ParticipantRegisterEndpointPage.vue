<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Copyright 2026 ThitsaWorks -->

<script setup lang="ts">
import {computed, reactive, ref} from 'vue';
import {VIEW_BY_KEY} from '../../modules/audit/view-definitions';
import {executeParticipantAction} from '../../modules/participant/api';
import ActionPage from '../shared/ActionPage.vue';

defineProps<{
    selectedTimeZone: string;
}>();

const emit = defineEmits<{
    (event: 'update:selectedTimeZone', value: string): void;
}>();

const viewDefinition = VIEW_BY_KEY['participant-register-endpoint'];

const form = reactive({
    name: '',
    endpoint: '',
});

const loading = ref(false);
const errorMessage = ref<string | null>(null);
const successMessage = ref<string | null>(null);
const responsePayload = ref<unknown>({
    status: 'idle',
});
const lastSubmittedAt = ref<string | null>(null);

const requestPreview = computed(() => {
    return {
        name: form.name.trim(),
        endpoint: form.endpoint.trim(),
    };
});

const canSubmit = computed((): boolean => {
    return form.name.trim().length > 0 && form.endpoint.trim().length > 0 && !loading.value;
});

const resetForm = (): void => {
    form.name = '';
    form.endpoint = '';
    errorMessage.value = null;
    successMessage.value = null;
    responsePayload.value = {status: 'idle'};
};

const submit = async (): Promise<void> => {
    if (!canSubmit.value) {
        return;
    }

    loading.value = true;
    errorMessage.value = null;
    successMessage.value = null;
    lastSubmittedAt.value = new Date().toISOString();

    try {
        const result = await executeParticipantAction('PUT', viewDefinition.endpoint, requestPreview.value);

        responsePayload.value = result.payload;
        successMessage.value = 'Participant endpoint registration completed.';
    } catch (error) {
        errorMessage.value = error instanceof Error ? error.message : String(error);
        responsePayload.value = {
            status: 'error',
            message: errorMessage.value,
        };
    } finally {
        loading.value = false;
    }
};
</script>

<template>
    <ActionPage
        eyebrow="Participant"
        :title="viewDefinition.title"
        :subtitle="viewDefinition.subtitle"
        form-description="Enter the participant name and base endpoint URL to register or replace its callback endpoints."
        :selected-time-zone="selectedTimeZone"
        :loading="loading"
        :error-message="errorMessage"
        :success-message="successMessage"
        :last-submitted-at="lastSubmittedAt"
        @update:selected-time-zone="emit('update:selectedTimeZone', $event)"
    >
        <template #form>
            <form class="space-y-5" @submit.prevent="submit">
                <div class="grid gap-4 lg:grid-cols-2">
                    <label class="block">
                        <span class="field-label">Participant Name</span>
                        <input
                            v-model="form.name"
                            class="field-input"
                            type="text"
                            placeholder="wallet1"
                            autocomplete="off"
                        >
                    </label>

                    <label class="block">
                        <span class="field-label">Base Endpoint URL</span>
                        <input
                            v-model="form.endpoint"
                            class="field-input"
                            type="url"
                            placeholder="http://localhost:3101"
                            autocomplete="off"
                        >
                    </label>
                </div>

                <div class="flex flex-wrap gap-3">
                    <button
                        type="submit"
                        class="inline-flex items-center gap-2 rounded-lg bg-accent px-3.5 py-2 font-display text-xs font-semibold text-white transition hover:bg-[#1289d8] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-white"
                        :disabled="!canSubmit"
                    >
                        <span
                            class="inline-block h-2.5 w-2.5 rounded-full bg-accentWarm"
                            :class="loading ? 'animate-pulseGlow' : ''"
                        />
                        {{ loading ? 'Submitting...' : 'Register Endpoint' }}
                    </button>

                    <button
                        type="button"
                        class="rounded-lg border border-accent/25 bg-[#f8fbff] px-3.5 py-2 text-xs font-semibold text-ink transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-100 disabled:text-slate-400"
                        :disabled="loading"
                        @click="resetForm"
                    >
                        Reset
                    </button>
                </div>
            </form>
        </template>

    </ActionPage>
</template>
