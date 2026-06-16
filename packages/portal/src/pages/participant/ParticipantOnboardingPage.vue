<script setup lang="ts">
import {computed, reactive, ref} from 'vue';
import CurrencySelector from '../../components/CurrencySelector.vue';
import StatusDialog from '../../components/StatusDialog.vue';
import {SIGNING_KEYS_UI_ENABLED} from '../../configs/pivotal-runtime-config';
import {VIEW_BY_KEY} from '../../modules/audit/view-definitions';
import {
    PARTICIPANT_CURRENCY_OPTIONS,
} from '../../modules/participant/constants';
import {executeParticipantAction} from '../../modules/participant/api';
import ActionPage from '../shared/ActionPage.vue';

defineProps<{
    selectedTimeZone: string;
}>();

const emit = defineEmits<{
    (event: 'update:selectedTimeZone', value: string): void;
}>();

const viewDefinition = VIEW_BY_KEY['participant-onboarding'];

const currencyPicker = ref('');
const selectedCurrencies = ref<string[]>([]);
const form = reactive({
    name: '',
    endpoint: '',
    jwsPublicKey: '',
    jwsPrivateKey: '',
    accessPublicKey: '',
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
    const jwsPublicKey = form.jwsPublicKey.trim();
    const jwsPrivateKey = form.jwsPrivateKey.trim();

    return {
        name: form.name.trim(),
        currencies: selectedCurrencies.value,
        endpoint: form.endpoint.trim(),
        ...(SIGNING_KEYS_UI_ENABLED && jwsPublicKey.length > 0 ? {jwsPublicKey} : {}),
        ...(SIGNING_KEYS_UI_ENABLED && jwsPrivateKey.length > 0 ? {jwsPrivateKey} : {}),
        accessPublicKey: form.accessPublicKey.trim(),
    };
});

const canSubmit = computed((): boolean => {
    return form.name.trim().length > 0
        && form.endpoint.trim().length > 0
        && (!SIGNING_KEYS_UI_ENABLED
            || (
                form.jwsPublicKey.trim().length > 0
                && form.jwsPrivateKey.trim().length > 0
            ))
        && form.accessPublicKey.trim().length > 0
        && !keyGenerationLoading.value
        && !loading.value;
});

const availableCurrencyOptions = computed(() => {
    return PARTICIPANT_CURRENCY_OPTIONS.filter((option): boolean => {
        return !selectedCurrencies.value.includes(option.value);
    });
});

const addCurrency = (currency: string): void => {
    currencyPicker.value = '';

    if (currency.trim().length === 0 || selectedCurrencies.value.includes(currency)) {
        return;
    }

    selectedCurrencies.value = [...selectedCurrencies.value, currency];
    errorMessage.value = null;
};

const removeCurrency = (currency: string): void => {
    selectedCurrencies.value = selectedCurrencies.value.filter((value: string): boolean => value !== currency);
};

const resetForm = (): void => {
    form.name = '';
    form.endpoint = '';
    form.jwsPublicKey = '';
    form.jwsPrivateKey = '';
    form.accessPublicKey = '';
    currencyPicker.value = '';
    selectedCurrencies.value = [];
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

    if (selectedCurrencies.value.length === 0) {
        errorMessage.value = 'Select at least one currency before submitting.';
        successMessage.value = null;
        responsePayload.value = {
            status: 'error',
            message: errorMessage.value,
        };

        return;
    }

    loading.value = true;
    errorMessage.value = null;
    successMessage.value = null;
    lastSubmittedAt.value = new Date().toISOString();

    try {
        const result = await executeParticipantAction('POST', viewDefinition.endpoint, requestPreview.value);

        responsePayload.value = result.payload;
        successMessage.value = `Participant ${form.name.trim()} was onboarded.`;
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
        form-description="Enter the participant name, base endpoint, supported currencies, and signing keys required to onboard a new FSP."
        :selected-time-zone="selectedTimeZone"
        :loading="loading"
        :error-message="errorMessage"
        :success-message="successMessage"
        :last-submitted-at="lastSubmittedAt"
        @update:selected-time-zone="emit('update:selectedTimeZone', $event)"
    >
        <template #form>
            <form class="space-y-4" @submit.prevent="submit">
                <section class="space-y-2.5 rounded-xl border border-accent/20 bg-[#fafdff] px-3 py-2.5">
                    <h3 class="text-xs font-bold uppercase tracking-[0.1em] text-[#147fc3]">
                        Participant
                    </h3>

                    <div class="grid gap-3 sm:grid-cols-2">
                        <label class="block">
                            <div class="relative">
                                <span class="pointer-events-none absolute left-3 top-1.5 z-10 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                                    Participant Name
                                </span>
                                <input
                                    v-model="form.name"
                                    class="field-input !pb-1.5 !pt-5 text-xs"
                                    type="text"
                                    placeholder="wallet1"
                                    autocomplete="off"
                                >
                            </div>
                        </label>

                        <label class="block">
                            <div class="relative">
                                <span class="pointer-events-none absolute left-3 top-1.5 z-10 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                                    Base Endpoint URL
                                </span>
                                <input
                                    v-model="form.endpoint"
                                    class="field-input !pb-1.5 !pt-5 text-xs"
                                    type="url"
                                    placeholder="http://localhost:3101"
                                    autocomplete="off"
                                >
                            </div>
                        </label>
                    </div>
                </section>

                <section class="space-y-2.5 rounded-xl border border-accent/20 bg-[#fafdff] px-3 py-2.5">
                    <h3 class="text-xs font-bold uppercase tracking-[0.1em] text-[#147fc3]">
                        Currencies
                    </h3>

                    <div class="grid gap-3 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
                        <label class="block">
                            <div class="relative">
                                <span class="pointer-events-none absolute left-3 top-1.5 z-10 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                                    Add Currency
                                </span>
                                <CurrencySelector
                                    :model-value="currencyPicker"
                                    :options="availableCurrencyOptions"
                                    placeholder="Select currency"
                                    button-class="!pb-1.5 !pt-5 text-xs"
                                    @update:model-value="addCurrency"
                                />
                            </div>
                        </label>

                        <div class="min-h-[2.75rem] rounded-xl border border-slate-300 bg-[#fcfdff] px-3 py-2.5">
                            <p class="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                                Selected Currencies
                            </p>
                            <div class="mt-2 flex flex-wrap items-start gap-2">
                                <span
                                    v-for="currency in selectedCurrencies"
                                    :key="currency"
                                    class="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accentSoft px-3 py-1 text-sm font-semibold text-accent"
                                >
                                    {{ currency }}
                                    <button
                                        type="button"
                                        class="inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] text-accent transition hover:bg-accent hover:text-white"
                                        @click="removeCurrency(currency)"
                                    >
                                        ×
                                    </button>
                                </span>
                                <span
                                    v-if="selectedCurrencies.length === 0"
                                    class="text-sm text-slate-500"
                                >
                                    No currencies selected.
                                </span>
                            </div>
                        </div>
                    </div>
                </section>

                <section
                    v-if="SIGNING_KEYS_UI_ENABLED"
                    class="space-y-2.5 rounded-xl border border-accent/20 bg-[#fafdff] px-3 py-2.5"
                >
                    <div class="flex flex-col gap-3 border-b border-accent/15 pb-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                            <h3 class="text-xs font-bold uppercase tracking-[0.1em] text-[#147fc3]">
                                For FSPIOP Signature
                            </h3>
                            <p class="mt-1 text-sm text-slate-600">
                                Provide your own JWS keys, or generate a PEM key pair here for signing FSPIOP messages.
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

                    <div class="grid gap-3 xl:grid-cols-2">
                        <label class="block">
                            <div class="relative">
                                <span class="pointer-events-none absolute left-3 top-1.5 z-10 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                                    JWS Public Key
                                </span>
                                <textarea
                                    v-model="form.jwsPublicKey"
                                    class="field-input min-h-32 !pb-2 !pt-5 font-mono text-xs"
                                    placeholder="-----BEGIN PUBLIC KEY-----"
                                    spellcheck="false"
                                ></textarea>
                            </div>
                        </label>

                        <label class="block">
                            <div class="relative">
                                <span class="pointer-events-none absolute left-3 top-1.5 z-10 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                                    JWS Private Key
                                </span>
                                <textarea
                                    v-model="form.jwsPrivateKey"
                                    class="field-input min-h-32 !pb-2 !pt-5 font-mono text-xs"
                                    placeholder="-----BEGIN PRIVATE KEY-----"
                                    spellcheck="false"
                                ></textarea>
                            </div>
                        </label>
                    </div>
                </section>

                <section class="space-y-2.5 rounded-xl border border-accent/20 bg-[#fafdff] px-3 py-2.5">
                    <h3 class="text-xs font-bold uppercase tracking-[0.1em] text-[#147fc3]">
                        Access
                    </h3>

                    <label class="block">
                        <div class="relative">
                            <span class="pointer-events-none absolute left-3 top-1.5 z-10 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                                Access Public Key
                            </span>
                            <textarea
                                v-model="form.accessPublicKey"
                                class="field-input min-h-32 !pb-2 !pt-5 font-mono text-xs"
                                placeholder="-----BEGIN PUBLIC KEY-----"
                                spellcheck="false"
                            ></textarea>
                        </div>
                    </label>
                </section>

                <div class="flex flex-wrap items-center gap-2.5 border-t border-slate-200 pt-2.5">
                    <button
                        type="submit"
                        class="inline-flex items-center gap-2 rounded-lg bg-accent px-3.5 py-2 font-display text-xs font-semibold text-white transition hover:bg-[#1289d8] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-white"
                        :disabled="!canSubmit"
                    >
                        <span
                            class="inline-block h-2.5 w-2.5 rounded-full bg-accentWarm"
                            :class="loading ? 'animate-pulseGlow' : ''"
                        />
                        {{ loading ? 'Submitting...' : 'Start Onboarding' }}
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
