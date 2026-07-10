<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Copyright 2024-2026 ThitsaWorks Pte. Ltd. -->

<script setup lang="ts">
import {watch} from 'vue';
import ToastOutlet from './components/ToastOutlet.vue';
import {resumeStoredReportPolling} from './composables/useDownloadReportState';
import {authStore} from './stores/auth.store';

watch(
    (): boolean => authStore.isAuthenticated.value,
    (isAuthenticated): void => {
        if (isAuthenticated) {
            resumeStoredReportPolling();
        }
    },
    {immediate: true},
);
</script>

<template>
    <div
        v-if="authStore.isBootstrapping.value"
        class="flex min-h-screen items-center justify-center bg-[#f7fbff] text-sm text-slate-500"
    >
        Loading…
    </div>
    <router-view v-else />
    <ToastOutlet />
</template>
