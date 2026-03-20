<script setup lang="ts">
import AuditQueryPage from '../shared/AuditQueryPage.vue';
import {VIEW_BY_KEY} from '../../../modules/audit/view-definitions';

defineProps<{
    selectedTimeZone: string;
}>();

const viewDefinition = VIEW_BY_KEY['inbound-transfers'];
</script>

<template>
    <AuditQueryPage
        :view-definition="viewDefinition"
        :selected-time-zone="selectedTimeZone"
    />
</template>
