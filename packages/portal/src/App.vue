<script setup lang="ts">
import {authStore} from './stores/auth.store';
</script>

<template>
    <div
        v-if="authStore.isBootstrapping.value"
        class="flex min-h-screen items-center justify-center bg-[#f7fbff] text-sm text-slate-500"
    >
        Loading…
    </div>
    <router-view v-else />
</template>
