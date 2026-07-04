<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Copyright 2026 ThitsaWorks -->

<script setup lang="ts">
import {computed, ref} from 'vue';
import {useRoute, useRouter} from 'vue-router';
import {ApiError} from '../../api/client';
import {authStore} from '../../stores/auth.store';

const route = useRoute();
const router = useRouter();

const currentPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const submitting = ref(false);
const errorMessage = ref<string | null>(null);

const PASSWORD_MIN_LENGTH = 12;

const passwordValidations = computed((): {label: string; ok: boolean}[] => [
    {label: `At least ${PASSWORD_MIN_LENGTH} characters`, ok: newPassword.value.length >= PASSWORD_MIN_LENGTH},
    {label: 'A lowercase letter', ok: /[a-z]/.test(newPassword.value)},
    {label: 'An uppercase letter', ok: /[A-Z]/.test(newPassword.value)},
    {label: 'A digit', ok: /\d/.test(newPassword.value)},
    {label: 'A symbol', ok: /[^A-Za-z0-9]/.test(newPassword.value)},
]);

const passwordMeetsPolicy = computed((): boolean =>
    passwordValidations.value.every((rule): boolean => rule.ok));

const passwordsMatch = computed((): boolean =>
    newPassword.value.length > 0 && newPassword.value === confirmPassword.value);

const submitDisabled = computed((): boolean => {

    if (submitting.value) {
        return true;
    }

    if (currentPassword.value.length === 0) {
        return true;
    }

    if (!passwordMeetsPolicy.value) {
        return true;
    }

    if (!passwordsMatch.value) {
        return true;
    }

    return false;
});

const redirectTarget = (): string => {

    const next = route.query.next;

    if (typeof next === 'string' && next.startsWith('/') && !next.startsWith('//')) {
        return next;
    }

    return '/';
};

const handleSubmit = async (): Promise<void> => {

    if (submitDisabled.value) {
        return;
    }

    submitting.value = true;
    errorMessage.value = null;

    try {
        await authStore.changePassword(currentPassword.value, newPassword.value);
        await router.replace(redirectTarget());
    } catch (error) {

        if (error instanceof ApiError) {

            if (error.code === 'AUTH_INVALID_CREDENTIALS') {
                errorMessage.value = 'Current password is incorrect.';
            } else if (error.code === 'AUTH_PASSWORD_SAME_AS_CURRENT') {
                errorMessage.value = 'New password must differ from the current password.';
            } else {
                errorMessage.value = error.message;
            }
        } else {
            errorMessage.value = error instanceof Error ? error.message : 'Could not change password.';
        }
    } finally {
        submitting.value = false;
    }
};
</script>

<template>
    <div class="flex min-h-screen items-center justify-center bg-[#f7fbff] px-4 py-10">
        <div class="w-full max-w-md rounded-2xl border border-accent/20 bg-white px-8 py-9 shadow-soft">
            <header class="mb-6 text-center">
                <p class="font-display text-xs uppercase tracking-[0.22em] text-accent">Pivotal Portal</p>
                <h1 class="mt-2 text-2xl font-semibold text-ink">Change password</h1>
                <p class="mt-1 text-sm text-slate-500">Choose a new password before continuing.</p>
            </header>

            <form class="space-y-4" @submit.prevent="handleSubmit">
                <div>
                    <label for="cp-current" class="block text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">
                        Current password
                    </label>
                    <input
                        id="cp-current"
                        v-model="currentPassword"
                        type="password"
                        autocomplete="current-password"
                        required
                        class="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                    >
                </div>

                <div>
                    <label for="cp-new" class="block text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">
                        New password
                    </label>
                    <input
                        id="cp-new"
                        v-model="newPassword"
                        type="password"
                        autocomplete="new-password"
                        required
                        class="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                    >
                </div>

                <ul class="space-y-1 text-xs text-slate-600">
                    <li
                        v-for="(rule, index) in passwordValidations"
                        :key="index"
                        :class="rule.ok ? 'text-emerald-600' : 'text-slate-500'"
                    >
                        <span class="mr-1">{{ rule.ok ? '✓' : '○' }}</span>{{ rule.label }}
                    </li>
                </ul>

                <div>
                    <label for="cp-confirm" class="block text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">
                        Confirm new password
                    </label>
                    <input
                        id="cp-confirm"
                        v-model="confirmPassword"
                        type="password"
                        autocomplete="new-password"
                        required
                        class="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                    >
                    <p
                        v-if="confirmPassword.length > 0 && !passwordsMatch"
                        class="mt-1 text-xs text-red-600"
                    >
                        Passwords do not match.
                    </p>
                </div>

                <div
                    v-if="errorMessage != null"
                    class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
                    role="alert"
                >
                    {{ errorMessage }}
                </div>

                <button
                    type="submit"
                    :disabled="submitDisabled"
                    class="inline-flex w-full items-center justify-center rounded-lg bg-accentWarm px-3 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-accentWarm/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {{ submitting ? 'Updating…' : 'Update password' }}
                </button>
            </form>
        </div>
    </div>
</template>
