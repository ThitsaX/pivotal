<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Copyright 2026 ThitsaWorks -->

<script setup lang="ts">
import {computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type Component} from 'vue';
import {useRoute, useRouter} from 'vue-router';
import EmptyMenuState from '../components/EmptyMenuState.vue';
import IdentityBadge from '../components/IdentityBadge.vue';
import SidebarMenuIcon from '../components/SidebarMenuIcon.vue';
import thitsaworksLogo from '../assets/thitsaworks_logo.jpg';
import {DESKTOP_BREAKPOINT} from '../modules/audit/helpers';
import type {ViewKey} from '../modules/audit/types';
import {SIGNING_KEYS_UI_ENABLED} from '../configs/pivotal-runtime-config';
import {menuStore, type MenuGroup, type MenuItem} from '../stores/menu.store';
import PermissionsAdminPage from './admin/PermissionsPage.vue';
import RolesAdminPage from './admin/RolesPage.vue';
import UsersAdminPage from './admin/UsersPage.vue';
import TransactionsPage from './audit/TransactionsPage.vue';
import DashboardPage from './DashboardPage.vue';
import HubAddCurrencyPage from './hub/HubAddCurrencyPage.vue';
import HubUpdateSigningKeysPage from './hub/HubUpdateSigningKeysPage.vue';
import HubListParticipantsPage from './hub/HubListParticipantsPage.vue';
import ParticipantAddNewCurrencyPage from './participant/ParticipantAddNewCurrencyPage.vue';
import ParticipantUpdateSigningKeysPage from './participant/ParticipantUpdateSigningKeysPage.vue';
import ParticipantOnboardingPage from './participant/ParticipantOnboardingPage.vue';
import ParticipantRegisterEndpointPage from './participant/ParticipantRegisterEndpointPage.vue';

const route = useRoute();
const router = useRouter();

const isSidebarOpen = ref(false);
const sidebarScrollContainer = ref<HTMLElement | null>(null);
const sidebarScrollIndicatorHeight = ref(0);
const sidebarScrollIndicatorOffset = ref(0);
const isSidebarScrollIndicatorVisible = ref(false);
const selectedTimeZone = ref(
    Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
);

const pageComponentByKey: Record<ViewKey, Component> = {
    'hub-add-currency': HubAddCurrencyPage,
    'hub-list-participants': HubListParticipantsPage,
    'hub-add-signing-keys': HubUpdateSigningKeysPage,
    'participant-onboarding': ParticipantOnboardingPage,
    'participant-add-signing-keys': ParticipantUpdateSigningKeysPage,
    'participant-add-new-currency': ParticipantAddNewCurrencyPage,
    'participant-register-endpoint': ParticipantRegisterEndpointPage,
    transactions: TransactionsPage,
    'admin-users': UsersAdminPage,
    'admin-roles': RolesAdminPage,
    'admin-permissions': PermissionsAdminPage,
};

const warnedMenuKeys = new Set<string>();

// Menus gated behind the signing-keys UI feature flag. Hidden while the flag is off.
const SIGNING_KEYS_MENU_KEYS: ReadonlySet<ViewKey> = new Set<ViewKey>([
    'hub-add-signing-keys',
    'participant-add-signing-keys',
]);

const isKnownViewKey = (key: string): key is ViewKey => {
    return Object.prototype.hasOwnProperty.call(pageComponentByKey, key);
};

const isMenuKeyEnabled = (key: ViewKey): boolean => {
    if (!SIGNING_KEYS_UI_ENABLED && SIGNING_KEYS_MENU_KEYS.has(key)) {
        return false;
    }

    return true;
};

const visibleGroups = computed((): MenuGroup[] => {
    const groups: MenuGroup[] = [];

    for (const group of menuStore.state.groups) {
        const visibleMenus: MenuItem[] = [];

        for (const menu of group.menus) {

            if (!isKnownViewKey(menu.key)) {

                if (!warnedMenuKeys.has(menu.key)) {
                    warnedMenuKeys.add(menu.key);
                    console.warn(`[menu] Unknown menu key '${menu.key}' returned from /auth/me/menu — item hidden.`);
                }

                continue;
            }

            if (!isMenuKeyEnabled(menu.key)) {
                continue;
            }

            visibleMenus.push(menu);
        }

        if (visibleMenus.length > 0) {
            groups.push({label: group.label, menus: visibleMenus});
        }
    }
    return groups;
});

const visibleMenuKeys = computed((): Set<ViewKey> => {
    const keys = new Set<ViewKey>();

    for (const group of visibleGroups.value) {
        for (const menu of group.menus) {
            if (isKnownViewKey(menu.key)) {
                keys.add(menu.key);
            }
        }
    }

    return keys;
});

const isMenuEmpty = computed((): boolean => {
    return menuStore.state.loaded && visibleGroups.value.length === 0;
});

const activeViewKey = computed((): ViewKey | null => {
    const path = route.path;

    if (!path.startsWith('/views/')) {
        return null;
    }

    const candidate = path.slice('/views/'.length).split('/')[0];

    if (candidate === '' || !isKnownViewKey(candidate)) {
        return null;
    }

    return candidate;
});

const isDashboardActive = computed((): boolean => activeViewKey.value === null);

const isActiveViewAllowed = computed((): boolean => {
    const key = activeViewKey.value;

    if (key == null) {
        return true;
    }

    return visibleMenuKeys.value.has(key);
});

const activePageComponent = computed((): Component | null => {
    const key = activeViewKey.value;

    if (key === null || !isActiveViewAllowed.value) {
        return null;
    }

    return pageComponentByKey[key];
});

const handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
        isSidebarOpen.value = false;
    }
};

const updateSidebarScrollIndicator = (): void => {
    const container = sidebarScrollContainer.value;

    if (container == null) {
        isSidebarScrollIndicatorVisible.value = false;

        return;
    }

    const visibleHeight = container.clientHeight;
    const contentHeight = container.scrollHeight;
    const maxScrollTop = contentHeight - visibleHeight;

    if (maxScrollTop <= 0) {
        isSidebarScrollIndicatorVisible.value = false;
        sidebarScrollIndicatorHeight.value = 0;
        sidebarScrollIndicatorOffset.value = 0;

        return;
    }

    const indicatorHeight = Math.max((visibleHeight / contentHeight) * visibleHeight, 20);
    const maxIndicatorOffset = visibleHeight - indicatorHeight;
    const indicatorOffset = maxScrollTop > 0
        ? (container.scrollTop / maxScrollTop) * maxIndicatorOffset
        : 0;

    isSidebarScrollIndicatorVisible.value = true;
    sidebarScrollIndicatorHeight.value = indicatorHeight;
    sidebarScrollIndicatorOffset.value = indicatorOffset;
};

const handleWindowResize = (): void => {
    if (window.innerWidth < DESKTOP_BREAKPOINT) {
        isSidebarOpen.value = false;
    }

    updateSidebarScrollIndicator();
};

onMounted((): void => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleWindowResize);
    isSidebarOpen.value = window.innerWidth >= DESKTOP_BREAKPOINT;
    void nextTick((): void => {
        updateSidebarScrollIndicator();
    });
});

onBeforeUnmount((): void => {
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('resize', handleWindowResize);
});

watch(isSidebarOpen, async (): Promise<void> => {
    await nextTick();
    updateSidebarScrollIndicator();
});

watch(visibleGroups, async (): Promise<void> => {
    await nextTick();
    updateSidebarScrollIndicator();
});

watch(
    [activeViewKey, isActiveViewAllowed],
    ([key, allowed]): void => {
        if (key != null && !allowed) {
            void router.replace('/');
        }
    },
    {immediate: true},
);

const closeSidebarOnMobile = (): void => {
    if (window.innerWidth < DESKTOP_BREAKPOINT) {
        isSidebarOpen.value = false;
    }
};

const navigateToMenu = (menu: MenuItem): void => {
    void router.push(menu.route);
    closeSidebarOnMobile();
};

const openDashboard = (): void => {
    void router.push('/');
    closeSidebarOnMobile();
};

const openFirstMenuInGroup = (group: MenuGroup): void => {
    if (group.menus.length === 0) {
        return;
    }

    navigateToMenu(group.menus[0]);
};
</script>

<template>
    <div class="min-h-screen">
        <button
            v-if="!isSidebarOpen"
            type="button"
            class="fixed left-3 top-3 z-50 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#3d257f]/30 bg-[#fbfdff] text-ink shadow-soft transition hover:border-[#3d257f] lg:hidden"
            @click="isSidebarOpen = true"
        >
            <img
                :src="thitsaworksLogo"
                alt="Open menu"
                class="h-7 w-7 rounded-full object-cover"
            >
        </button>

        <div
            v-if="isSidebarOpen"
            class="fixed inset-0 z-30 bg-slate-950/35 lg:hidden"
            @click="isSidebarOpen = false"
        />

        <aside
            :class="[
                'fixed inset-y-0 left-0 z-40 flex w-72 flex-col overflow-hidden border-r border-accent/20 bg-[#f7fbff] px-4 pb-6 pt-5 transition-transform duration-200',
                isSidebarOpen ? 'translate-x-0' : '-translate-x-full',
            ]"
        >
            <header class="mb-5 shrink-0 border-b border-slate-200 pb-4">
                <div class="flex items-start justify-between gap-2">
                    <div class="flex items-start gap-3">
                        <button
                            type="button"
                            class="hidden h-10 w-10 items-center justify-center rounded-xl border border-[#3d257f]/30 bg-[#fbfdff] text-ink shadow-soft transition hover:border-[#3d257f] lg:inline-flex"
                            @click="isSidebarOpen = false"
                        >
                            <img
                                :src="thitsaworksLogo"
                                alt="Collapse menu"
                                class="h-7 w-7 rounded-full object-cover"
                            >
                        </button>

                        <div>
                            <p class="font-display text-sm uppercase tracking-[0.22em] text-accent">
                                Pivotal Portal
                            </p>
                            <p class="mt-1 text-[11px] font-medium tracking-[0.04em] text-slate-500">
                                Built by
                                <a
                                    href="https://www.thitsaworks.com"
                                    target="_blank"
                                    rel="noreferrer"
                                    class="text-[#3d257f] transition hover:text-[#5032a4]"
                                >
                                    ThitsaWorks
                                </a>
                            </p>
                        </div>
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

            <div class="relative min-h-0 flex-1">
                <nav
                    ref="sidebarScrollContainer"
                    class="sidebar-scroll h-full overflow-y-auto"
                    @scroll="updateSidebarScrollIndicator"
                >
                    <div class="space-y-4 pl-2">
                    <section class="space-y-2">
                        <h2 class="px-1 text-xs font-semibold uppercase tracking-[0.12em] text-accent">
                            Main
                        </h2>
                        <button
                            type="button"
                            :class="[
                                'group flex w-full items-center gap-2.5 border px-3 py-2.5 text-left text-sm font-semibold transition',
                                isDashboardActive
                                    ? 'border-accentWarm bg-accentWarm text-white'
                                    : 'border-transparent bg-transparent text-ink hover:border-accent/35 hover:text-accent',
                            ]"
                            @click="openDashboard"
                        >
                            <span :class="[isDashboardActive ? 'text-white' : 'text-[#d97706] group-hover:text-[#b45309]']">
                                <SidebarMenuIcon item="dashboard" />
                            </span>
                            <span>Dashboard</span>
                        </button>
                    </section>

                    <EmptyMenuState v-if="isMenuEmpty" />

                    <section
                        v-for="group in visibleGroups"
                        :key="group.label"
                        class="space-y-2"
                    >
                        <h2 class="px-1 text-xs font-semibold uppercase tracking-[0.12em] text-accent">
                            {{ group.label }}
                        </h2>

                        <button
                            v-for="menu in group.menus"
                            :key="menu.key"
                            type="button"
                            :class="[
                                'group flex w-full items-center gap-2.5 border px-3 py-2.5 text-left text-sm font-semibold transition',
                                !isDashboardActive && activeViewKey === menu.key
                                    ? 'border-accentWarm bg-accentWarm text-white'
                                    : 'border-transparent bg-transparent text-ink hover:border-accent/35 hover:text-accent',
                            ]"
                            @click="navigateToMenu(menu)"
                        >
                            <span :class="[!isDashboardActive && activeViewKey === menu.key ? 'text-white' : 'text-[#d97706] group-hover:text-[#b45309]']">
                                <SidebarMenuIcon :item="menu.key" />
                            </span>
                            <span>{{ menu.label }}</span>
                        </button>
                    </section>
                    </div>
                </nav>

                <div
                    v-if="isSidebarScrollIndicatorVisible"
                    class="pointer-events-none absolute inset-y-0 left-0 w-px"
                >
                    <div
                        class="absolute left-0 w-px rounded-full bg-[#f59e0b]"
                        :style="{
                            height: `${sidebarScrollIndicatorHeight}px`,
                            transform: `translateY(${sidebarScrollIndicatorOffset}px)`,
                        }"
                    />
                </div>
            </div>

            <IdentityBadge />
        </aside>

        <aside
            v-if="!isSidebarOpen"
            class="fixed inset-y-0 left-0 z-20 hidden w-16 border-r border-accent/20 bg-[#f7fbff] px-2 pt-5 lg:block"
        >
            <div class="flex justify-center">
                <button
                    type="button"
                    class="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#3d257f]/30 bg-[#fbfdff] text-ink shadow-soft transition hover:border-[#3d257f]"
                    @click="isSidebarOpen = true"
                >
                    <img
                        :src="thitsaworksLogo"
                        alt="Open menu"
                        class="h-7 w-7 rounded-full object-cover"
                    >
                </button>
            </div>
        </aside>

        <main
            :class="[
                'min-h-screen px-4 pb-8 pt-9 transition-[padding] duration-200 lg:px-8 lg:pt-1',
                isSidebarOpen ? 'lg:pl-[320px]' : 'lg:pl-[88px]',
            ]"
        >
            <DashboardPage
                v-if="isDashboardActive"
                :groups="visibleGroups"
                :selected-time-zone="selectedTimeZone"
                @update:selected-time-zone="selectedTimeZone = $event"
                @open-group="openFirstMenuInGroup"
            />

            <KeepAlive>
                <component
                    :is="activePageComponent"
                    v-if="!isDashboardActive && activePageComponent !== null"
                    :key="activeViewKey"
                    :selected-time-zone="selectedTimeZone"
                    @update:selected-time-zone="selectedTimeZone = $event"
                />
            </KeepAlive>
        </main>
    </div>
</template>

<style scoped>
.sidebar-scroll {
    scrollbar-width: none;
    -ms-overflow-style: none;
}

.sidebar-scroll::-webkit-scrollbar {
    display: none;
}
</style>
