<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Copyright 2024-2026 ThitsaWorks Pte. Ltd. -->

<script setup lang="ts">
defineProps<{
    message?: string;
}>();
</script>

<template>
    <div class="flex min-h-[400px] items-center justify-center px-4 py-8">
        <div class="max-w-md rounded-2xl border border-slate-200 bg-white px-6 py-8 text-center shadow-soft">
            <h2 class="text-base font-semibold text-ink">Access denied</h2>
            <p class="mt-2 text-sm text-slate-600">
                {{ message ?? 'You do not have permission to view this page. Contact your administrator if you believe this is a mistake.' }}
            </p>
        </div>
    </div>
</template>
