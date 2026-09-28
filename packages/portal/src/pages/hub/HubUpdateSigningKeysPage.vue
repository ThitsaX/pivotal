<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Copyright 2024-2026 ThitsaWorks Pte. Ltd. -->

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

const viewDefinition = VIEW_BY_KEY['hub-add-signing-keys'];

const form = reactive({
    jwsPublicKey: '',
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
        jwsPublicKey: form.jwsPublicKey.trim(),
    };
});

const canSubmit = computed((): boolean => {
    return form.jwsPublicKey.trim().length > 0
        && !loading.value;
});

const resetForm = (): void => {
    form.jwsPublicKey = '';
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
        const result = await executeParticipantAction('POST', viewDefinition.endpoint, requestPreview.value);

        responsePayload.value = result.payload;
        successMessage.value = 'Signing keys were saved for hub.';
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
        eyebrow="Hub"
        :title="viewDefinition.title"
        :subtitle="viewDefinition.subtitle"
        form-description="Paste the JWS public and private keys to create or replace the signing key pair for Hub."
        :selected-time-zone="selectedTimeZone"
        :loading="loading"
        :error-message="errorMessage"
        :success-message="successMessage"
        :last-submitted-at="lastSubmittedAt"
        @update:selected-time-zone="emit('update:selectedTimeZone', $event)"
    >
        <template #form>
            <form class="space-y-5" @submit.prevent="submit">
                <section class="space-y-2.5 rounded-xl border border-accent/20 bg-[#fafdff] px-3 py-2.5">
                    <div class="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <h3 class="text-xs font-bold uppercase tracking-[0.1em] text-[#147fc3]">
                                Signing Keys
                            </h3>
                            <p class="mt-1 max-w-2xl text-sm text-slate-600">
                                The Hub's public key, used to verify what it signs. Pivotal never signs as the Hub, so no private key is held.
                            </p>
                        </div>

                    </div>

                    <div class="grid gap-4">
                        <label class="block">
                            <span class="field-label">JWS Public Key</span>
                            <textarea
                                v-model="form.jwsPublicKey"
                                class="field-input min-h-[16rem] resize-y font-mono text-xs leading-5"
                                placeholder="-----BEGIN PUBLIC KEY-----"
                                spellcheck="false"
                            />
                        </label>

                    </div>
                </section>

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
                        {{ loading ? 'Submitting...' : 'Add Signing Keys' }}
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
