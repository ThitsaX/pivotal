<script setup lang="ts">
import {computed} from 'vue';
import {toastStore, type ToastTone} from '../stores/toast.store';

const toneClass = (tone: ToastTone): string => {
    switch (tone) {
        case 'success':
            return 'border-emerald-200 bg-emerald-50 text-emerald-800';
        case 'error':
            return 'border-red-200 bg-red-50 text-red-800';
        case 'warning':
            return 'border-amber-200 bg-amber-50 text-amber-800';
        case 'info':
        default:
            return 'border-sky-200 bg-sky-50 text-sky-800';
    }
};

const accentClass = (tone: ToastTone): string => {
    switch (tone) {
        case 'success':
            return 'bg-emerald-500';
        case 'error':
            return 'bg-red-500';
        case 'warning':
            return 'bg-amber-500';
        case 'info':
        default:
            return 'bg-sky-500';
    }
};

const messages = computed(() => toastStore.state.messages);
</script>

<template>
    <Teleport to="body">
        <div
            class="fixed left-1/2 top-4 z-[100] w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2"
            aria-live="polite"
            aria-relevant="additions removals"
        >
            <TransitionGroup name="toast" tag="div" class="flex flex-col gap-2">
                <div
                    v-for="message in messages"
                    :key="message.id"
                    :class="[
                        'relative overflow-hidden rounded-lg border px-3 py-3 text-sm shadow-[0_10px_30px_rgba(15,23,42,0.15)]',
                        'backdrop-blur supports-[backdrop-filter]:bg-white/80',
                        toneClass(message.tone),
                    ]"
                    role="status"
                >
                    <span :class="['absolute left-0 top-0 h-full w-1', accentClass(message.tone)]" />

                    <div class="flex items-start gap-3 pl-1">
                        <span :class="['mt-1 h-2.5 w-2.5 shrink-0 rounded-full', accentClass(message.tone)]" />
                        <div class="min-w-0 flex-1">
                            <p v-if="message.title" class="text-[13px] font-semibold leading-5">
                                {{ message.title }}
                            </p>
                            <p class="break-words text-[12px] leading-5" :class="message.title ? 'mt-0.5' : ''">
                                {{ message.message }}
                            </p>
                        </div>
                        <button
                            type="button"
                            class="hidden shrink-0 rounded-md px-2 py-1 text-[14px] leading-none opacity-60 transition hover:bg-black/5 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-slate-300"
                            aria-label="Dismiss notification"
                            @click="toastStore.dismiss(message.id)"
                        >
                            ×
                        </button>
                    </div>
                </div>
            </TransitionGroup>
        </div>
    </Teleport>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
    transition: opacity 140ms ease, transform 160ms ease;
}

.toast-enter-from,
.toast-leave-to {
    opacity: 0;
    transform: translateY(-6px);
}
</style>
