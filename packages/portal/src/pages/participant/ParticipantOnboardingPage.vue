<script setup lang="ts">
import {VIEW_BY_KEY} from '../../modules/audit/view-definitions';
import ParticipantFeaturePage from './shared/ParticipantFeaturePage.vue';

defineProps<{
    selectedTimeZone: string;
}>();

const viewDefinition = VIEW_BY_KEY['participant-onboarding'];
</script>

<template>
    <ParticipantFeaturePage
        eyebrow="Participant"
        :title="viewDefinition.title"
        :subtitle="viewDefinition.subtitle"
        primary-action-label="Prepare onboarding request"
        primary-action-description="Use this page entry point for participant registration, setup validation, and handoff into the onboarding flow."
        secondary-action-label="Review required data"
        secondary-action-description="Capture participant identity, settlement details, and environment readiness before starting downstream integration steps."
    />
</template>
