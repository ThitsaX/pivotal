<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Copyright 2024-2026 ThitsaWorks Pte. Ltd. -->

<script setup lang="ts">
import {computed, reactive, ref} from 'vue';
import {VIEW_BY_KEY} from '../../modules/audit/view-definitions';
import {executeParticipantAction, fetchParticipantResource} from '../../modules/participant/api';
import {
    canEnableSigning,
    jwsPolicyChanges,
    type JwsPolicy,
    type JwsVerifyMode,
} from '../../modules/participant/jws-policy';
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
//
// The current switches are loaded before anything can be changed, and only the ones the operator
// moves are sent. Submitting a form that starts from fixed defaults would write those defaults
// over settings the operator never saw.
const fspIdInput = ref('');
const current = ref<JwsPolicy | null>(null);
const form = reactive({
    jwsSignEnabled: false,
    jwsVerifyMode: 'off' as JwsVerifyMode,
});

const loading = ref(false);
const errorMessage = ref<string | null>(null);
const successMessage = ref<string | null>(null);
const lastSubmittedAt = ref<string | null>(null);

const loadedForInput = computed((): boolean =>
    current.value != null && current.value.fspId === fspIdInput.value.trim());

const changes = computed(() =>
    loadedForInput.value && current.value != null ? jwsPolicyChanges(current.value, form) : null);

const signingLocked = computed((): boolean =>
    current.value != null && !current.value.jwsSignEnabled && !canEnableSigning(current.value));

const canLoad = computed((): boolean => fspIdInput.value.trim().length > 0 && !loading.value);
const canSubmit = computed((): boolean => changes.value != null && !loading.value);

const apply = (policy: JwsPolicy): void => {
    current.value = policy;
    form.jwsSignEnabled = policy.jwsSignEnabled;
    form.jwsVerifyMode = policy.jwsVerifyMode;
};

const load = async (): Promise<void> => {
    if (!canLoad.value || loadedForInput.value) {
        return;
    }

    const fspId = fspIdInput.value.trim();

    loading.value = true;
    errorMessage.value = null;
    successMessage.value = null;
    current.value = null;

    try {
        apply(await fetchParticipantResource<JwsPolicy>(
            `${viewDefinition.endpoint}?fspId=${encodeURIComponent(fspId)}`));
    } catch (error) {
        errorMessage.value = error instanceof Error ? error.message : String(error);
    } finally {
        loading.value = false;
    }
};

const submit = async (): Promise<void> => {
    if (!canSubmit.value || changes.value == null) {
        return;
    }

    loading.value = true;
    errorMessage.value = null;
    successMessage.value = null;
    lastSubmittedAt.value = new Date().toISOString();

    try {
        const result = await executeParticipantAction(
            'PUT', viewDefinition.endpoint, {...changes.value});
        const saved = result.payload as {jwsSignEnabled: boolean; jwsVerifyMode: JwsVerifyMode};

        if (current.value != null) {
            apply({...current.value, jwsSignEnabled: saved.jwsSignEnabled, jwsVerifyMode: saved.jwsVerifyMode});
        }

        successMessage.value = `JWS policy updated for ${fspIdInput.value.trim()}.`;
    } catch (error) {
        errorMessage.value = error instanceof Error ? error.message : String(error);
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
        form-description="Load a participant to see its current settings, then change what you need. Only the settings you change are saved."
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
                                v-model="fspIdInput"
                                class="field-input"
                                type="text"
                                placeholder="DemoDFSP1"
                                autocomplete="off"
                                @keydown.enter.prevent="load"
                            >
                        </label>
                        <div class="flex items-end">
                            <button
                                type="button"
                                class="rounded-lg border border-accent/25 bg-[#f8fbff] px-3.5 py-2 text-xs font-semibold text-ink transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-100 disabled:text-slate-400"
                                :disabled="!canLoad || loadedForInput"
                                @click="load"
                            >
                                Load current settings
                            </button>
                        </div>
                    </div>

                    <p v-if="loadedForInput && current" class="text-sm text-slate-600">
                        Current: signing <strong>{{ current.jwsSignEnabled ? 'on' : 'off' }}</strong>,
                        verify mode <strong>{{ current.jwsVerifyMode }}</strong>
                        <span v-if="current.role === 'peer'"> (peer: Pivotal only verifies this participant)</span>.
                    </p>
                </section>

                <template v-if="loadedForInput">

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
                            :disabled="signingLocked"
                        >
                        <span class="text-sm text-slate-700">Sign outbound requests</span>
                    </label>
                    <p v-if="signingLocked" class="text-sm text-slate-500">
                        Signing cannot be turned on: this participant is a peer, or has no signing key.
                    </p>
                </section>

                <section class="space-y-2.5 rounded-xl border border-accent/20 bg-[#fafdff] px-3 py-2.5">
                    <div>
                        <h3 class="text-xs font-bold uppercase tracking-[0.1em] text-[#147fc3]">
                            Inbound Verification
                        </h3>
                        <p class="mt-1 max-w-2xl text-sm text-slate-600">
                            How strictly signatures on requests from this participant are checked.
                        </p>
                    </div>

                    <label class="block">
                        <span class="field-label">Verify Mode</span>
                        <select v-model="form.jwsVerifyMode" class="field-input">
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

                </template>

                <div class="flex justify-end">
                    <button
                        type="submit"
                        class="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:bg-slate-300"
                        :disabled="!canSubmit"
                    >
                        {{ loading ? 'Saving...' : 'Save Changes' }}
                    </button>
                </div>
            </form>
        </template>
    </ActionPage>
</template>
