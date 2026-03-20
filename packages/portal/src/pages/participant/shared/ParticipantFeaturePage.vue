<script setup lang="ts">
defineProps<{
    eyebrow: string;
    title: string;
    subtitle: string;
    primaryActionLabel: string;
    primaryActionDescription: string;
    secondaryActionLabel: string;
    secondaryActionDescription: string;
}>();
</script>

<template>
    <section class="pt-6">
        <article class="overflow-hidden border border-accent/20 bg-[#fafdff] shadow-[0_18px_40px_rgba(20,127,195,0.08)]">
            <div class="border-b border-accent/15 bg-[linear-gradient(135deg,rgba(20,127,195,0.14),rgba(255,255,255,0.95))] px-5 py-5">
                <p class="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
                    {{ eyebrow }}
                </p>
                <h3 class="mt-2 font-display text-2xl text-ink">
                    {{ title }}
                </h3>
                <p class="mt-2 max-w-3xl text-sm text-slate-600">
                    {{ subtitle }}
                </p>
            </div>

            <div class="grid gap-4 px-5 py-5 lg:grid-cols-2">
                <article class="rounded-xl border border-accent/20 bg-white px-4 py-4">
                    <p class="text-xs font-semibold uppercase tracking-[0.12em] text-accent">
                        Primary Action
                    </p>
                    <h4 class="mt-2 font-display text-lg text-ink">
                        {{ primaryActionLabel }}
                    </h4>
                    <p class="mt-2 text-sm text-slate-600">
                        {{ primaryActionDescription }}
                    </p>
                </article>

                <article class="rounded-xl border border-accent/20 bg-white px-4 py-4">
                    <p class="text-xs font-semibold uppercase tracking-[0.12em] text-accent">
                        Supporting Detail
                    </p>
                    <h4 class="mt-2 font-display text-lg text-ink">
                        {{ secondaryActionLabel }}
                    </h4>
                    <p class="mt-2 text-sm text-slate-600">
                        {{ secondaryActionDescription }}
                    </p>
                </article>
            </div>
        </article>
    </section>
</template>
