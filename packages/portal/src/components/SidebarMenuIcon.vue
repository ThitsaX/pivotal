<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Copyright 2024-2026 ThitsaWorks Pte. Ltd. -->

<script setup lang="ts">
import {computed} from 'vue';

const props = defineProps<{
    item: string;
}>();

const variant = computed((): string => {
    if (props.item === 'dashboard') {
        return 'dashboard';
    }

    if (props.item === 'admin-users') {
        return 'admin-users';
    }

    if (props.item === 'admin-roles') {
        return 'admin-roles';
    }

    if (props.item === 'admin-permissions') {
        return 'admin-permissions';
    }

    if (props.item.includes('onboarding')) {
        return 'onboarding';
    }

    if (props.item.includes('currency')) {
        return 'currency';
    }

    if (props.item.includes('signing')) {
        return 'signing';
    }

    if (props.item.includes('endpoint')) {
        return 'endpoint';
    }

    if (props.item.includes('participants')) {
        return 'parties';
    }

    if (props.item.includes('parties')) {
        return 'parties';
    }

    if (props.item.includes('quotes')) {
        return 'quotes';
    }

    if (props.item.includes('transfers')) {
        return 'transfers';
    }

    return 'dashboard';
});
</script>

<template>
    <svg
        v-if="variant === 'dashboard'"
        class="h-4 w-4 shrink-0"
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden="true"
    >
        <path d="M3 10.2 10 4l7 6.2V17H3v-6.8Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" />
        <path d="M7.5 17v-4.5h5V17" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" />
    </svg>

    <svg
        v-else-if="variant === 'onboarding'"
        class="h-4 w-4 shrink-0"
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden="true"
    >
        <rect x="3" y="4" width="14" height="12" rx="2" stroke="currentColor" stroke-width="1.7" />
        <path d="M6.5 8h7M6.5 11h4.5M13.5 6.5l1 1-2.5 2.5-1.25.25.25-1.25 2.5-2.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
    </svg>

    <svg
        v-else-if="variant === 'currency'"
        class="h-4 w-4 shrink-0"
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden="true"
    >
        <circle cx="10" cy="10" r="6.5" stroke="currentColor" stroke-width="1.7" />
        <path d="M10 6.5v7M7 8.5c0-1 1-2 3-2s3 1 3 2-1 1.6-3 2-3 1-3 2 1 2 3 2 3-1 3-2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
    </svg>

    <svg
        v-else-if="variant === 'signing'"
        class="h-4 w-4 shrink-0"
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden="true"
    >
        <rect x="3.5" y="5" width="8.5" height="10.5" rx="2" stroke="currentColor" stroke-width="1.7" />
        <path d="M6.3 8.2h2.8M6.3 11h2.8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
        <path d="M12 10h1.8m0 0a2.7 2.7 0 1 1 0 5.4H12.5m1.3-5.4V8.6a2.1 2.1 0 1 1 4.2 0V10m-4.2 0H18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
    </svg>

    <svg
        v-else-if="variant === 'endpoint'"
        class="h-4 w-4 shrink-0"
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden="true"
    >
        <path d="M7 13 4.5 15.5a2.12 2.12 0 1 1-3-3L4 10" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
        <path d="M13 7 15.5 4.5a2.12 2.12 0 0 1 3 3L16 10" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
        <path d="M6.5 13.5 13.5 6.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
    </svg>

    <svg
        v-else-if="variant === 'parties'"
        class="h-4 w-4 shrink-0"
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden="true"
    >
        <circle cx="7" cy="7.2" r="2.2" stroke="currentColor" stroke-width="1.6" />
        <circle cx="13.2" cy="8.2" r="1.8" stroke="currentColor" stroke-width="1.6" />
        <path d="M3.8 15.5c.5-2.1 2.1-3.4 4.3-3.4s3.8 1.3 4.3 3.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
        <path d="M11.8 14.8c.3-1.5 1.4-2.4 2.9-2.4 1.2 0 2.2.5 2.9 1.6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
    </svg>

    <svg
        v-else-if="variant === 'quotes'"
        class="h-4 w-4 shrink-0"
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden="true"
    >
        <rect x="4" y="3.5" width="12" height="13" rx="2" stroke="currentColor" stroke-width="1.7" />
        <path d="M7 7h6M7 10h6M7 13h3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
    </svg>

    <svg
        v-else-if="variant === 'admin-users'"
        class="h-4 w-4 shrink-0"
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden="true"
    >
        <circle cx="8" cy="7.5" r="2.5" stroke="currentColor" stroke-width="1.7" />
        <path d="M3 16c.6-2.4 2.5-3.8 5-3.8s4.4 1.4 5 3.8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
        <circle cx="14.5" cy="8" r="2" stroke="currentColor" stroke-width="1.5" />
        <path d="M13 13.4c.4-.9 1.3-1.4 2.4-1.4 1.4 0 2.5.8 2.8 2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
    </svg>

    <svg
        v-else-if="variant === 'admin-roles'"
        class="h-4 w-4 shrink-0"
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden="true"
    >
        <path d="M10 3.2 4.2 5.2v4.2c0 3.4 2.4 6.4 5.8 7.4 3.4-1 5.8-4 5.8-7.4V5.2L10 3.2Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" />
        <path d="m7.6 10.2 1.8 1.8 3.2-3.4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
    </svg>

    <svg
        v-else-if="variant === 'admin-permissions'"
        class="h-4 w-4 shrink-0"
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden="true"
    >
        <circle cx="7.5" cy="9" r="3" stroke="currentColor" stroke-width="1.7" />
        <path d="m9.7 7.2 7 7m-2.5-.5 1.5 1.5m-3-3 1.4 1.4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
    </svg>

    <svg
        v-else
        class="h-4 w-4 shrink-0"
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden="true"
    >
        <path d="M4 6.5h9.5M4 10h9.5M4 13.5h9.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
        <path d="M11.5 4.5 15.5 8.5 11.5 12.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
</template>
