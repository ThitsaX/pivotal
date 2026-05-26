<script setup lang="ts">
import {ref, watch} from 'vue';

const props = defineProps<{
    open:         boolean;
    title?:       string;
    description?: string;
    userEmail:    string;
    tempPassword: string;
}>();

const emit = defineEmits<{
    close: [];
}>();

const copied = ref(false);
const copyError = ref<string | null>(null);

watch(() => props.open, (open) => {
    if (!open) {
        copied.value = false;
        copyError.value = null;
    }
});

const copyToClipboard = async (): Promise<void> => {

    copyError.value = null;

    try {

        if (navigator.clipboard?.writeText != null) {
            await navigator.clipboard.writeText(props.tempPassword);
            copied.value = true;
            return;
        }

        copyError.value = 'Clipboard access is not available in this browser. Please copy manually.';
    } catch (error) {
        copyError.value = error instanceof Error ? error.message : 'Could not copy to clipboard.';
    }
};
</script>

<template>
    <div
        v-if="open"
        class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
        role="dialog"
        aria-modal="true"
    >
        <div class="w-full max-w-lg rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-soft">
            <h2 class="text-base font-semibold text-ink">
                {{ title ?? 'Temporary password' }}
            </h2>
            <p class="mt-1 text-sm text-slate-600">
                {{ description ?? `Copy and share this password with ${userEmail} via a secure channel. They will be required to change it on first sign-in.` }}
            </p>

            <div class="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800" role="alert">
                Save this now — it will not be shown again.
            </div>

            <div class="mt-3 flex items-stretch gap-2">
                <code
                    class="flex-1 select-all break-all rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-sm text-ink"
                >{{ tempPassword }}</code>
                <button
                    type="button"
                    class="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white transition hover:bg-accent/90"
                    @click="copyToClipboard"
                >
                    {{ copied ? 'Copied' : 'Copy' }}
                </button>
            </div>

            <p v-if="copyError != null" class="mt-2 text-xs text-red-700">
                {{ copyError }}
            </p>

            <div class="mt-5 flex justify-end">
                <button
                    type="button"
                    class="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-ink transition hover:bg-slate-50"
                    @click="emit('close')"
                >
                    Done
                </button>
            </div>
        </div>
    </div>
</template>
