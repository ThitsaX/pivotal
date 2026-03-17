<script setup lang="ts">
import {VIEW_BY_KEY} from '../../modules/audit/view-definitions';
import ParticipantFeaturePage from './shared/ParticipantFeaturePage.vue';

defineProps<{
    selectedTimeZone: string;
}>();

const viewDefinition = VIEW_BY_KEY['participant-add-new-currency'];
</script>

<template>
    <ParticipantFeaturePage
        eyebrow="Participant"
        :title="viewDefinition.title"
        :subtitle="viewDefinition.subtitle"
        primary-action-label="Initiate currency setup"
        primary-action-description="Use this page entry point to add a newly supported currency for an existing participant and track the setup scope."
        secondary-action-label="Confirm operational readiness"
        secondary-action-description="Verify currency configuration, settlement coverage, and partner alignment before exposing the new currency in live flows."
    />
</template>
