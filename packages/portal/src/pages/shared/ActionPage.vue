<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Copyright 2024-2026 ThitsaWorks Pte. Ltd. -->

<script setup lang="ts">
import {computed, ref, watch} from 'vue';
import StatusDialog from '../../components/StatusDialog.vue';
import TimeZoneSelector from '../../components/TimeZoneSelector.vue';

const props = withDefaults(defineProps<{
    eyebrow?: string;
    title: string;
    subtitle: string;
    formDescription?: string;
    selectedTimeZone: string;
    loading: boolean;
    errorMessage: string | null;
    successMessage: string | null;
    lastSubmittedAt: string | null;
}>(), {
    formDescription: '',
});

const emit = defineEmits<{
    (event: 'update:selectedTimeZone', value: string): void;
}>();

const dismissedErrorMessage = ref<string | null>(null);
const dismissedSuccessMessage = ref<string | null>(null);

watch(() => props.errorMessage, (value: string | null): void => {
    if (value == null) {
        dismissedErrorMessage.value = null;
    }
});

watch(() => props.successMessage, (value: string | null): void => {
    if (value == null) {
        dismissedSuccessMessage.value = null;
    }
});

const showErrorDialog = computed((): boolean => {
    return props.errorMessage != null && props.errorMessage !== dismissedErrorMessage.value;
});

const showSuccessDialog = computed((): boolean => {
    return props.successMessage != null && props.successMessage !== dismissedSuccessMessage.value;
});

const resolvedFormDescription = computed((): string => {
    if (props.formDescription.trim().length > 0) {
        return props.formDescription;
    }

    if (props.title === 'Register Endpoint') {
        return 'Enter the participant name and base endpoint URL to register or replace its callback endpoints.';
    }

    if (props.title === 'Add Currency') {
        return 'Select an existing participant and choose the currencies to add to that participant.';
    }

    if (props.title === 'Onboard FSP') {
        return 'Enter the participant name, base endpoint, supported currencies, and signing keys required to onboard a new FSP.';
    }

    return 'Complete the required fields for this action and submit the request.';
});

const formatTimestamp = (value: string | null): string => {
    if (value == null) {
        return 'Not submitted yet';
    }

    const parsed = new Date(value);

    if (Number.isNaN(parsed.getTime())) {
        return value;
    }

    return new Intl.DateTimeFormat('en-GB', {
        dateStyle: 'medium',
        timeStyle: 'medium',
    }).format(parsed);
};

const closeErrorDialog = (): void => {
    dismissedErrorMessage.value = props.errorMessage;
};

const closeSuccessDialog = (): void => {
    dismissedSuccessMessage.value = props.successMessage;
};
</script>

<template>
    <section class="animate-fadeSlide pt-2">
        <div class="mb-2 flex justify-end">
            <div class="w-full max-w-[13rem]">
                <TimeZoneSelector
                    :model-value="props.selectedTimeZone"
                    compact
                    @update:model-value="emit('update:selectedTimeZone', $event)"
                />
            </div>
        </div>

        <article class="overflow-visible border border-accent/20 bg-[#fafdff] shadow-[0_18px_40px_rgba(20,127,195,0.08)]">
            <div class="border-b border-accent/15 bg-[linear-gradient(135deg,rgba(20,127,195,0.14),rgba(255,255,255,0.95))] px-5 py-5">
                <div>
                    <p
                        v-if="props.eyebrow != null && props.eyebrow.trim().length > 0"
                        class="text-xs font-semibold uppercase tracking-[0.18em] text-accent"
                    >
                        {{ props.eyebrow }}
                    </p>
                    <h3 class="mt-2 font-display text-2xl text-ink">
                        {{ props.title }}
                    </h3>
                    <p class="mt-2 max-w-3xl text-sm text-slate-600">
                        {{ props.subtitle }}
                    </p>
                </div>
            </div>

            <div class="px-5 py-5">
                <article class="border border-accent/20 bg-white shadow-[0_18px_40px_rgba(20,127,195,0.08)]">
                    <div class="border-b border-accent/15 bg-[#f8fbff] px-4 py-3">
                        <div>
                            <p class="font-display text-sm font-semibold uppercase tracking-[0.08em] text-accent">
                                Command Form
                            </p>
                            <p class="mt-0.5 text-xs text-slate-500">
                                {{ resolvedFormDescription }}
                            </p>
                        </div>
                    </div>

                    <div class="px-4 py-4">
                        <slot name="form" />
                    </div>
                </article>
            </div>
        </article>
    </section>

    <StatusDialog
        :open="showSuccessDialog"
        tone="success"
        eyebrow="Request Completed"
        title="Request completed"
        :message="props.successMessage"
        @close="closeSuccessDialog"
    >
        <p v-if="props.lastSubmittedAt != null" class="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
            Submitted at {{ formatTimestamp(props.lastSubmittedAt) }}
        </p>
    </StatusDialog>

    <StatusDialog
        :open="showErrorDialog"
        tone="error"
        eyebrow="Request Failed"
        title="Request could not be completed"
        :message="props.errorMessage"
        @close="closeErrorDialog"
    >
        <p v-if="props.lastSubmittedAt != null" class="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
            Attempted at {{ formatTimestamp(props.lastSubmittedAt) }}
        </p>
    </StatusDialog>
</template>
