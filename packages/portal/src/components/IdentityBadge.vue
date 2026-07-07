<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Copyright 2026 ThitsaWorks -->

<script setup lang="ts">
import {computed, ref} from 'vue';
import {useRouter} from 'vue-router';
import ConfirmDialog from './admin/ConfirmDialog.vue';
import {authStore} from '../stores/auth.store';

const router = useRouter();

const signingOut = ref(false);
const confirmLogoutOpen = ref(false);
const logoutError = ref<string | null>(null);

const user = computed(() => authStore.state.user);

const initials = computed((): string => {
    const email = user.value?.email;

    if (email == null || email.length === 0) {
        return '?';
    }

    return email.slice(0, 2).toUpperCase();
});

const handleLogout = async (): Promise<void> => {

    if (signingOut.value) {
        return;
    }

    signingOut.value = true;
    logoutError.value = null;

    try {
        await authStore.logout();
        await router.replace('/login');
        confirmLogoutOpen.value = false;
    } catch (error) {
        logoutError.value = error instanceof Error ? error.message : 'Sign out failed.';
    } finally {
        signingOut.value = false;
    }
};

const requestLogout = (): void => {
    if (signingOut.value) {
        return;
    }

    logoutError.value = null;
    confirmLogoutOpen.value = true;
};

const cancelLogout = (): void => {
    if (!signingOut.value) {
        confirmLogoutOpen.value = false;
    }
};
</script>

<template>
    <div
        v-if="user != null"
        class="mt-4 shrink-0 border-t border-slate-200 pt-3"
    >
        <div class="flex items-center gap-3 px-1">
            <div class="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-xs font-semibold uppercase text-white">
                {{ initials }}
            </div>
            <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-semibold text-ink">{{ user.email }}</p>
                <p class="truncate text-[11px] uppercase tracking-[0.08em] text-slate-500">
                    {{ user.role }}<span v-if="user.fspId != null"> · {{ user.fspId }}</span>
                </p>
            </div>
        </div>
        <button
            type="button"
            class="mt-3 inline-flex w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
            :disabled="signingOut"
            @click="requestLogout"
        >
            {{ signingOut ? 'Signing out…' : 'Sign out' }}
        </button>

        <ConfirmDialog
            :open="confirmLogoutOpen"
            title="Sign out"
            message="Are you sure you want to sign out of the Pivotal Portal?"
            :busy="signingOut"
            :error-message="logoutError"
            confirm-label="Sign out"
            tone="danger"
            @confirm="handleLogout"
            @cancel="cancelLogout"
        />
    </div>
</template>
