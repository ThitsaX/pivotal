<script setup lang="ts">
import {computed, ref} from 'vue';

const props = defineProps<{
    title: string;
    value: unknown;
}>();

const copied = ref(false);

const rawJson = computed((): string | null => {
    if (props.value == null) {
        return null;
    }

    if (typeof props.value === 'string') {
        return props.value;
    }

    try {
        return JSON.stringify(props.value, null, 2);
    } catch {
        return String(props.value);
    }
});

const highlightedJson = computed((): string => {
    if (rawJson.value == null) {
        return '<span class="text-slate-400">No data</span>';
    }

    const escaped = rawJson.value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    return escaped.replace(
        /("(\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?)/g,
        (token: string): string => {
            let colorClass = 'text-slate-200';

            if (token.startsWith('"')) {
                colorClass = token.endsWith(':') ? 'text-cyan-300' : 'text-emerald-300';
            } else if (token === 'true' || token === 'false') {
                colorClass = 'text-amber-300';
            } else if (token === 'null') {
                colorClass = 'text-rose-300';
            } else {
                colorClass = 'text-violet-300';
            }

            return `<span class="${colorClass}">${token}</span>`;
        },
    );
});

const copyToClipboard = async (): Promise<void> => {
    if (rawJson.value == null) {
        return;
    }

    try {
        await navigator.clipboard.writeText(rawJson.value);
        copied.value = true;
        setTimeout(() => {
            copied.value = false;
        }, 1400);
    } catch {
        copied.value = false;
    }
};
</script>

<template>
    <section class="rounded-xl border border-slate-700/50 bg-[#0f1e31] shadow-soft">
        <header class="flex items-center justify-between border-b border-slate-700/50 px-3 py-2">
            <h4 class="font-display text-xs uppercase tracking-[0.14em] text-slate-200">
                {{ title }}
            </h4>
            <button
                type="button"
                class="rounded-md border border-slate-600 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-200 transition hover:border-[#7cc6ff] hover:text-[#7cc6ff]"
                @click="copyToClipboard"
            >
                {{ copied ? 'Copied' : 'Copy' }}
            </button>
        </header>
        <pre
            class="max-h-[24rem] overflow-auto px-3 py-3 font-mono text-xs leading-6 text-slate-50"
            v-html="highlightedJson"
        />
    </section>
</template>
