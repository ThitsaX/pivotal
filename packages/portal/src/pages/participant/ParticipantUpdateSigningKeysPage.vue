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

const viewDefinition = VIEW_BY_KEY['participant-add-signing-keys'];

// This page used to accept a pasted key pair. It no longer does, and no page does: signing keys
// are provisioned during onboarding into whatever custody the deployment uses, which under the
// HSM profile means a key that cannot be exported and so could never be pasted anywhere. What is
// left are the operational switches, which are decisions rather than secrets.
const form = reactive({
    fspId: '',
    jwsSignEnabled: false,
    jwsVerifyMode: '' as '' | 'off' | 'verify-if-present' | 'require',
});

const loading = ref(false);
const errorMessage = ref<string | null>(null);
const successMessage = ref<string | null>(null);
const responsePayload = ref<unknown>({status: 'idle'});
const lastSubmittedAt = ref<string | null>(null);

const requestPreview = computed(() => ({
    fspId: form.fspId.trim(),
    jwsSignEnabled: form.jwsSignEnabled,
    // Omitted rather than sent empty: the two switches move independently, and an omitted field
    // leaves the current value rather than resetting it.
    ...(form.jwsVerifyMode.length > 0 ? {jwsVerifyMode: form.jwsVerifyMode} : {}),
}));

const canSubmit = computed((): boolean => form.fspId.trim().length > 0 && !loading.value);

const submit = async (): Promise<void> => {
    if (!canSubmit.value) {
        return;
    }

    loading.value = true;
    errorMessage.value = null;
    successMessage.value = null;
    lastSubmittedAt.value = new Date().toISOString();

    try {
        const result = await executeParticipantAction(
            'PUT', viewDefinition.endpoint, requestPreview.value);

        responsePayload.value = result.payload;
        successMessage.value = `Signing policy updated for ${form.fspId.trim()}.`;
    } catch (error) {
        errorMessage.value = error instanceof Error ? error.message : String(error);
        responsePayload.value = {status: 'error', message: errorMessage.value};
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
        form-description="Signing keys are provisioned automatically during onboarding. These switches control whether a participant signs, and how strictly their inbound signatures are checked."
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
                    <h3 class="text-xs font-bold uppercase tracking-[0.1em] text-[#147fc3]">
                        Participant
                    </h3>

                    <div class="grid gap-4 lg:grid-cols-2">
                        <label class="block">
                            <span class="field-label">Participant Name</span>
                            <input
                                v-model="form.fspId"
                                class="field-input"
                                type="text"
                                placeholder="DemoDFSP1"
                                autocomplete="off"
                            >
                        </label>
                    </div>
                </section>

                <section class="space-y-2.5 rounded-xl border border-accent/20 bg-[#fafdff] px-3 py-2.5">
                    <div>
                        <h3 class="text-xs font-bold uppercase tracking-[0.1em] text-[#147fc3]">
                            Outbound Signing
                        </h3>
                        <p class="mt-1 max-w-2xl text-sm text-slate-600">
                            Whether requests sent on this participant's behalf carry an FSPIOP
                            signature. Turned on automatically once their public key has been
                            registered with the switch, so this is for changing it afterwards.
                        </p>
                    </div>

                    <label class="mt-2 flex items-center gap-2">
                        <input
                            v-model="form.jwsSignEnabled"
                            type="checkbox"
                            class="h-4 w-4 rounded border-accent/40 text-accent"
                        >
                        <span class="text-sm text-slate-700">Sign outbound requests</span>
                    </label>
                </section>

                <section class="space-y-2.5 rounded-xl border border-accent/20 bg-[#fafdff] px-3 py-2.5">
                    <div>
                        <h3 class="text-xs font-bold uppercase tracking-[0.1em] text-[#147fc3]">
                            Inbound Verification
                        </h3>
                        <p class="mt-1 max-w-2xl text-sm text-slate-600">
                            How strictly signatures on requests from this participant are checked.
                            Leave unchanged to keep the current setting.
                        </p>
                    </div>

                    <label class="block">
                        <span class="field-label">Verify Mode</span>
                        <select v-model="form.jwsVerifyMode" class="field-input">
                            <option value="">
                                Leave unchanged
                            </option>
                            <option value="off">
                                Off — signatures ignored
                            </option>
                            <option value="verify-if-present">
                                Verify if present — a signature must verify, a missing one is accepted
                            </option>
                            <option value="require">
                                Require — a missing or invalid signature is rejected
                            </option>
                        </select>
                    </label>
                </section>

                <div class="flex justify-end">
                    <button
                        type="submit"
                        class="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:bg-slate-300"
                        :disabled="!canSubmit"
                    >
                        {{ loading ? 'Saving...' : 'Update Policy' }}
                    </button>
                </div>
            </form>
        </template>
    </ActionPage>
</template>
