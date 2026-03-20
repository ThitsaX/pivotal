<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref, type Component} from 'vue';
import TimeZoneSelector from './components/TimeZoneSelector.vue';
import {DESKTOP_BREAKPOINT, groupViews} from './modules/audit/helpers';
import type {ViewKey} from './modules/audit/types';
import {VIEW_BY_KEY, VIEW_DEFINITIONS} from './modules/audit/view-definitions';
import InboundPartiesPage from './pages/audit/inbound/InboundPartiesPage.vue';
import InboundQuotesPage from './pages/audit/inbound/InboundQuotesPage.vue';
import InboundTransfersPage from './pages/audit/inbound/InboundTransfersPage.vue';
import OutboundPartiesPage from './pages/audit/outbound/OutboundPartiesPage.vue';
import OutboundQuotesPage from './pages/audit/outbound/OutboundQuotesPage.vue';
import OutboundTransfersPage from './pages/audit/outbound/OutboundTransfersPage.vue';
import ParticipantAddNewCurrencyPage from './pages/participant/ParticipantAddNewCurrencyPage.vue';
import ParticipantOnboardingPage from './pages/participant/ParticipantOnboardingPage.vue';

const isSidebarOpen = ref(false);
const isDashboardActive = ref(true);
const activeViewKey = ref<ViewKey>('outbound-parties');
const selectedTimeZone = ref(
    Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
);

const groupedViews = computed(() => {
    return groupViews(VIEW_DEFINITIONS);
});

const activeView = computed(() => {
    return VIEW_BY_KEY[activeViewKey.value];
});

const pageComponentByKey: Record<ViewKey, Component> = {
    'participant-onboarding': ParticipantOnboardingPage,
    'participant-add-new-currency': ParticipantAddNewCurrencyPage,
    'inbound-parties': InboundPartiesPage,
    'inbound-quotes': InboundQuotesPage,
    'inbound-transfers': InboundTransfersPage,
    'outbound-parties': OutboundPartiesPage,
    'outbound-quotes': OutboundQuotesPage,
    'outbound-transfers': OutboundTransfersPage,
};

const activePageComponent = computed((): Component => {
    return pageComponentByKey[activeViewKey.value];
});

const handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
        isSidebarOpen.value = false;
    }
};

onMounted((): void => {
    window.addEventListener('keydown', handleKeyDown);
    isSidebarOpen.value = window.innerWidth >= DESKTOP_BREAKPOINT;
});

onBeforeUnmount((): void => {
    window.removeEventListener('keydown', handleKeyDown);
});

const changeView = (viewKey: ViewKey): void => {
    isDashboardActive.value = false;
    activeViewKey.value = viewKey;

    if (window.innerWidth < DESKTOP_BREAKPOINT) {
        isSidebarOpen.value = false;
    }
};

const openDashboard = (): void => {
    isDashboardActive.value = true;

    if (window.innerWidth < DESKTOP_BREAKPOINT) {
        isSidebarOpen.value = false;
    }
};
</script>

<template>
    <div class="min-h-screen">
        <button
            type="button"
            class="fixed left-3 top-3 z-50 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-accent/25 bg-[#fbfdff] text-ink shadow-soft transition hover:border-accent hover:text-accent"
            @click="isSidebarOpen = !isSidebarOpen"
        >
            <span class="text-base leading-none">☰</span>
        </button>

        <div
            v-if="isSidebarOpen"
            class="fixed inset-0 z-30 bg-slate-950/35 lg:hidden"
            @click="isSidebarOpen = false"
        />

        <aside
            :class="[
                'fixed inset-y-0 left-0 z-40 w-72 border-r border-accent/20 bg-[#f7fbff] px-4 pb-6 pt-5 transition-transform duration-200',
                isSidebarOpen ? 'translate-x-0' : '-translate-x-full',
            ]"
        >
            <header class="mb-5 border-b border-slate-200 pb-4">
                <div class="ml-12 flex items-start justify-between gap-2">
                    <div>
                        <p class="font-display text-sm uppercase tracking-[0.22em] text-accent">
                            Pivotal Portal
                        </p>
                    </div>
                    <button
                        type="button"
                        class="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100 lg:hidden"
                        @click="isSidebarOpen = false"
                    >
                        ✕
                    </button>
                </div>
            </header>

            <nav class="space-y-4">
                <section class="space-y-2">
                    <h2 class="px-1 text-xs font-semibold uppercase tracking-[0.12em] text-accent">
                        Main
                    </h2>
                    <button
                        type="button"
                        :class="[
                            'w-full border px-3 py-2.5 text-left text-sm font-semibold transition',
                            isDashboardActive
                                ? 'border-accent bg-accent text-white'
                                : 'border-transparent bg-slate-100/85 text-ink hover:border-accent/35 hover:bg-accentSoft',
                        ]"
                        @click="openDashboard"
                    >
                        Dashboard
                    </button>
                </section>

                <section
                    v-for="group in groupedViews"
                    :key="group.group"
                    class="space-y-2"
                >
                    <h2 class="px-1 text-xs font-semibold uppercase tracking-[0.12em] text-accent">
                        {{ group.group }}
                    </h2>

                    <button
                        v-for="view in group.views"
                        :key="view.key"
                        type="button"
                        :class="[
                            'w-full border px-3 py-2.5 text-left text-sm font-semibold transition',
                            !isDashboardActive && activeViewKey === view.key
                                ? 'border-accent bg-accent text-white'
                                : 'border-transparent bg-slate-100/85 text-ink hover:border-accent/35 hover:bg-accentSoft',
                        ]"
                        @click="changeView(view.key)"
                    >
                        {{ view.menuLabel }}
                    </button>
                </section>
            </nav>
        </aside>

        <main
            :class="[
                'min-h-screen px-4 pb-8 pt-14 transition-[padding] duration-200 lg:px-8 lg:pt-6',
                isSidebarOpen ? 'lg:pl-[320px]' : 'lg:pl-8',
            ]"
        >
            <header class="border-b border-accent/20 pb-3">
                <div class="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
                    <h2 class="font-display text-xl leading-tight text-accent lg:text-2xl">
                        {{ isDashboardActive ? 'Dashboard' : activeView.title }}
                    </h2>

                    <TimeZoneSelector v-model="selectedTimeZone" />
                </div>
            </header>

            <section v-if="isDashboardActive" class="pt-6">
                <article class="rounded-xl border border-accent/20 bg-[#fafdff] p-5">
                    <h3 class="font-display text-lg text-accent">Audit Overview</h3>
                    <p class="mt-2 max-w-3xl text-sm text-slate-600">
                        Choose one of the pages from the left menu to search audit data or open participant workflows.
                    </p>
                    <div class="mt-4 flex flex-wrap gap-2">
                        <button
                            v-for="group in groupedViews"
                            :key="`dashboard-${group.group}`"
                            type="button"
                            class="rounded-lg border border-accent/25 bg-[#f8fbff] px-3 py-2 text-sm font-semibold text-accent transition hover:border-accent"
                            :disabled="group.views.length === 0"
                            @click="group.views.length > 0 && changeView(group.views[0].key)"
                        >
                            Open {{ group.group }}
                        </button>
                    </div>
                </article>
            </section>

            <KeepAlive>
                <component
                    :is="activePageComponent"
                    v-if="!isDashboardActive"
                    :key="activeViewKey"
                    :selected-time-zone="selectedTimeZone"
                />
            </KeepAlive>
        </main>
    </div>
</template>
