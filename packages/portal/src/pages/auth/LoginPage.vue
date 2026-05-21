<script setup lang="ts">
import {computed, ref} from 'vue';
import {useRoute, useRouter} from 'vue-router';
import {ApiError} from '../../api/client';
import {authStore} from '../../stores/auth.store';

const route = useRoute();
const router = useRouter();

const email = ref('');
const password = ref('');
const submitting = ref(false);
const errorMessage = ref<string | null>(null);
const lockoutMessage = ref<string | null>(null);

const submitDisabled = computed((): boolean => {

    if (submitting.value) {
        return true;
    }

    return email.value.trim().length === 0 || password.value.length === 0;
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
    lockoutMessage.value = null;

    try {
        await authStore.login(email.value.trim(), password.value);

        if (authStore.needsPasswordChange.value) {
            await router.replace({path: '/change-password', query: {next: redirectTarget()}});

            return;
        }

        await router.replace(redirectTarget());
    } catch (error) {

        if (error instanceof ApiError) {

            if (error.code === 'AUTH_ACCOUNT_LOCKED') {
                lockoutMessage.value = error.message;
            } else if (error.code === 'AUTH_INVALID_CREDENTIALS') {
                errorMessage.value = 'Email or password is incorrect.';
            } else {
                errorMessage.value = error.message;
            }
        } else {
            errorMessage.value = error instanceof Error ? error.message : 'Login failed.';
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
                <h1 class="mt-2 text-2xl font-semibold text-ink">Sign in</h1>
                <p class="mt-1 text-sm text-slate-500">Enter your credentials to continue.</p>
            </header>

            <form class="space-y-4" @submit.prevent="handleSubmit">
                <div>
                    <label for="login-email" class="block text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">
                        Email
                    </label>
                    <input
                        id="login-email"
                        v-model="email"
                        type="email"
                        autocomplete="email"
                        required
                        class="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                    >
                </div>

                <div>
                    <label for="login-password" class="block text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">
                        Password
                    </label>
                    <input
                        id="login-password"
                        v-model="password"
                        type="password"
                        autocomplete="current-password"
                        required
                        class="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                    >
                </div>

                <div
                    v-if="lockoutMessage != null"
                    class="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800"
                    role="alert"
                >
                    {{ lockoutMessage }}
                </div>

                <div
                    v-else-if="errorMessage != null"
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
                    {{ submitting ? 'Signing in…' : 'Sign in' }}
                </button>
            </form>
        </div>
    </div>
</template>
