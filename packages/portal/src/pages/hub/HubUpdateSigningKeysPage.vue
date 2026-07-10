<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Copyright 2024-2026 ThitsaWorks Pte. Ltd. -->

<script setup lang="ts">
import {computed, reactive, ref} from 'vue';
import StatusDialog from '../../components/StatusDialog.vue';
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
    jwsPrivateKey: '',
});

const loading = ref(false);
const keyGenerationLoading = ref(false);
const keyGenerationMessage = ref<string | null>(null);
const keyGenerationError = ref<string | null>(null);
const errorMessage = ref<string | null>(null);
const successMessage = ref<string | null>(null);
const responsePayload = ref<unknown>({
    status: 'idle',
});
const lastSubmittedAt = ref<string | null>(null);

const requestPreview = computed(() => {
    return {
        jwsPublicKey: form.jwsPublicKey.trim(),
        jwsPrivateKey: form.jwsPrivateKey.trim(),
    };
});

const canSubmit = computed((): boolean => {
    return form.jwsPublicKey.trim().length > 0
        && form.jwsPrivateKey.trim().length > 0
        && !keyGenerationLoading.value
        && !loading.value;
});

const resetForm = (): void => {
    form.jwsPublicKey = '';
    form.jwsPrivateKey = '';
    keyGenerationMessage.value = null;
    keyGenerationError.value = null;
    errorMessage.value = null;
    successMessage.value = null;
    responsePayload.value = {status: 'idle'};
};

const generateSigningKeys = async (modulusLength: number): Promise<void> => {
    keyGenerationLoading.value = true;
    keyGenerationMessage.value = null;
    keyGenerationError.value = null;

    try {
        const result = await executeParticipantAction('POST', '/participant/signing-key', {
            size: modulusLength,
        });
        const generatedKeyPair = result.payload as {publicKey?: string; privateKey?: string};

        if (generatedKeyPair.publicKey == null || generatedKeyPair.privateKey == null) {
            throw new Error('Generated key pair payload is incomplete.');
        }

        form.jwsPublicKey = generatedKeyPair.publicKey;
        form.jwsPrivateKey = generatedKeyPair.privateKey;
        keyGenerationMessage.value = `Generated ${modulusLength}-bit PEM signing key pair.`;
    } catch (error) {
        keyGenerationError.value = error instanceof Error ? error.message : String(error);
    } finally {
        keyGenerationLoading.value = false;
    }
};

const closeKeyGenerationDialog = (): void => {
    keyGenerationMessage.value = null;
    keyGenerationError.value = null;
};

const isKeyGenerationDialogOpen = computed((): boolean => {
    return keyGenerationMessage.value != null || keyGenerationError.value != null;
});

const keyGenerationDialogTone = computed((): 'error' | 'success' => {
    return keyGenerationError.value != null ? 'error' : 'success';
});

const keyGenerationDialogEyebrow = computed((): string => {
    return keyGenerationError.value != null ? 'Key Generation Failed' : 'Key Generation Completed';
});

const keyGenerationDialogTitle = computed((): string => {
    return keyGenerationError.value != null
        ? 'Signing key generation could not be completed'
        : 'Signing key pair generated';
});

const keyGenerationDialogMessage = computed((): string | null => {
    return keyGenerationError.value ?? keyGenerationMessage.value;
});

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
                                Paste PEM-formatted values exactly as issued. Existing keys for Hub will be replaced.
                            </p>
                        </div>

                        <div class="flex flex-wrap gap-2">
                            <button
                                type="button"
                                class="rounded-lg border border-accent/25 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-accent transition hover:border-accent disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-100 disabled:text-slate-400"
                                :disabled="keyGenerationLoading"
                                @click="generateSigningKeys(2048)"
                            >
                                {{ keyGenerationLoading ? 'Generating...' : 'Generate 2048' }}
                            </button>

                            <button
                                type="button"
                                class="rounded-lg border border-accent/25 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-accent transition hover:border-accent disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-100 disabled:text-slate-400"
                                :disabled="keyGenerationLoading"
                                @click="generateSigningKeys(4096)"
                            >
                                {{ keyGenerationLoading ? 'Generating...' : 'Generate 4096' }}
                            </button>
                        </div>
                    </div>

                    <div class="grid gap-4 xl:grid-cols-2">
                        <label class="block">
                            <span class="field-label">JWS Public Key</span>
                            <textarea
                                v-model="form.jwsPublicKey"
                                class="field-input min-h-[16rem] resize-y font-mono text-xs leading-5"
                                placeholder="-----BEGIN PUBLIC KEY-----"
                                spellcheck="false"
                            />
                        </label>

                        <label class="block">
                            <span class="field-label">JWS Private Key</span>
                            <textarea
                                v-model="form.jwsPrivateKey"
                                class="field-input min-h-[16rem] resize-y font-mono text-xs leading-5"
                                placeholder="-----BEGIN PRIVATE KEY-----"
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

    <StatusDialog
        :open="isKeyGenerationDialogOpen"
        :tone="keyGenerationDialogTone"
        :eyebrow="keyGenerationDialogEyebrow"
        :title="keyGenerationDialogTitle"
        :message="keyGenerationDialogMessage"
        @close="closeKeyGenerationDialog"
    />
</template>
