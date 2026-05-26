<script setup lang="ts">
import AuditFindTransactionsPage from './AuditFindTransactionsPage.vue';
import {VIEW_BY_KEY} from '../../modules/audit/view-definitions';

defineProps<{
    selectedTimeZone: string;
}>();

const emit = defineEmits<{
    (event: 'update:selectedTimeZone', value: string): void;
}>();

const viewDefinition = VIEW_BY_KEY.transactions;
</script>

<template>
    <AuditFindTransactionsPage
        :view-definition="viewDefinition"
        :selected-time-zone="selectedTimeZone"
        @update:selected-time-zone="emit('update:selectedTimeZone', $event)"
    />
</template>
