<script setup lang="ts">
import TimeZoneSelector from '../components/TimeZoneSelector.vue';
import type {MenuGroup} from '../stores/menu.store';

defineProps<{
    groups: MenuGroup[];
    selectedTimeZone: string;
}>();

const emit = defineEmits<{
    (event: 'update:selectedTimeZone', value: string): void;
    (event: 'openGroup', group: MenuGroup): void;
}>();
</script>

<template>
    <section class="pt-2">
        <div class="mb-2 flex justify-end">
            <div class="w-full max-w-[13rem]">
                <TimeZoneSelector
                    :model-value="selectedTimeZone"
                    compact
                    @update:model-value="emit('update:selectedTimeZone', $event)"
                />
            </div>
        </div>

        <article class="overflow-visible border border-accent/20 bg-[#fafdff] shadow-[0_18px_40px_rgba(20,127,195,0.08)]">
            <div class="border-b border-accent/15 bg-[linear-gradient(135deg,rgba(20,127,195,0.14),rgba(255,255,255,0.95))] px-5 py-5">
                <div>
                    <p class="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
                        Overview
                    </p>
                    <h3 class="mt-2 font-display text-2xl text-ink">
                        Dashboard
                    </h3>
                    <p class="mt-2 max-w-3xl text-sm text-slate-600">
                        Choose one of the pages from the left menu to search audit data or open participant workflows.
                    </p>
                </div>
            </div>

            <div class="grid gap-4 px-5 py-5 lg:grid-cols-2">
                <article class="rounded-xl border border-accent/20 bg-white px-4 py-4">
                    <p class="text-xs font-semibold uppercase tracking-[0.12em] text-accent">
                        Navigation
                    </p>
                    <p class="mt-2 text-sm text-slate-600">
                        Jump directly into participant setup, inbound callbacks, or outbound audit investigations from one place.
                    </p>
                </article>

                <article class="rounded-xl border border-accent/20 bg-white px-4 py-4">
                    <p class="text-xs font-semibold uppercase tracking-[0.12em] text-accent">
                        Time Rendering
                    </p>
                    <p class="mt-2 text-sm text-slate-600">
                        The selected time zone is applied across the portal when displaying audit timestamps and review details.
                    </p>
                </article>
            </div>

            <div class="px-5 pb-5">
                <div class="flex flex-wrap gap-2">
                    <button
                        v-for="group in groups"
                        :key="`dashboard-${group.label}`"
                        type="button"
                        class="rounded-lg border border-accent/25 bg-[#f8fbff] px-3 py-2 text-sm font-semibold text-accent transition hover:border-accent"
                        :disabled="group.menus.length === 0"
                        @click="group.menus.length > 0 && emit('openGroup', group)"
                    >
                        Open {{ group.label }}
                    </button>
                </div>
            </div>
        </article>
    </section>
</template>
