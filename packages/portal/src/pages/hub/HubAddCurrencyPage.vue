<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Copyright 2026 ThitsaWorks -->

<script setup lang="ts">
import {computed, ref} from 'vue';
import CurrencySelector from '../../components/CurrencySelector.vue';
import {VIEW_BY_KEY} from '../../modules/audit/view-definitions';
import {PARTICIPANT_CURRENCY_OPTIONS} from '../../modules/participant/constants';
import {executeParticipantAction} from '../../modules/participant/api';
import ActionPage from '../shared/ActionPage.vue';

defineProps<{
    selectedTimeZone: string;
}>();

const emit = defineEmits<{
    (event: 'update:selectedTimeZone', value: string): void;
}>();

const viewDefinition = VIEW_BY_KEY['hub-add-currency'];

const currencyPicker = ref('');
const selectedCurrencies = ref<string[]>([]);

const loading = ref(false);
const errorMessage = ref<string | null>(null);
const successMessage = ref<string | null>(null);
const responsePayload = ref<unknown>({
    status: 'idle',
});
const lastSubmittedAt = ref<string | null>(null);

const requestPreview = computed(() => {
    return {
        currencies: selectedCurrencies.value,
    };
});

const availableCurrencyOptions = computed(() => {
    return PARTICIPANT_CURRENCY_OPTIONS.filter((option): boolean => {
        return !selectedCurrencies.value.includes(option.value);
    });
});

const canSubmit = computed((): boolean => {
    return selectedCurrencies.value.length > 0 && !loading.value;
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
    currencyPicker.value = '';
    selectedCurrencies.value = [];
    errorMessage.value = null;
    successMessage.value = null;
    responsePayload.value = {status: 'idle'};
};

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
        const payloads = [];

        for (const currency of selectedCurrencies.value) {
            const result = await executeParticipantAction('POST', viewDefinition.endpoint, {
                currency,
            });

            payloads.push(result.payload);
        }

        responsePayload.value = payloads;
        successMessage.value = `Hub currencies ${requestPreview.value.currencies.join(', ')} were added.`;
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
        form-description="Choose one or more currencies to provision the required Hub accounts and settlement model."
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
                        {{ loading ? 'Submitting...' : 'Add Currency' }}
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
