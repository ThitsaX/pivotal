<script setup lang="ts">
import {computed, onMounted, ref} from 'vue';
import AccessDeniedPanel from '../../components/admin/AccessDeniedPanel.vue';
import {authStore} from '../../stores/auth.store';
import {type AdminMenu, menusAdminStore} from '../../stores/menus-admin.store';
import {permissionsAdminStore} from '../../stores/permissions-admin.store';
import {type AdminRole, rolesAdminStore} from '../../stores/roles-admin.store';

const hasPermission = computed((): boolean => authStore.hasPermission('admin.permissions.list'));

const permState = permissionsAdminStore.state;
const rolesState = rolesAdminStore.state;
const menusState = menusAdminStore.state;

const rolesFetchedForCrossRef = ref(false);
const menusFetchedForCrossRef = ref(false);
const crossRefError = ref<string | null>(null);
const canReadRoles = computed((): boolean => authStore.hasPermission('admin.roles.manage'));
const canReadMenus = computed((): boolean => authStore.hasPermission('admin.menus.manage'));

const groups = permissionsAdminStore.groupedByNamespace;

const loadRoleCrossReferences = async (): Promise<void> => {

    if (!canReadRoles.value) return;

    try {

        if (rolesState.items.length === 0 && rolesState.loadError == null) {
            await rolesAdminStore.loadRoles();
        }
        if (rolesState.loadError != null) return;

        for (const role of rolesState.items) {
            if (rolesState.permissionsByRole[role.id] != null) continue;
            try {
                await rolesAdminStore.loadPermissions(role.id);
            } catch (error) {
                crossRefError.value = error instanceof Error ? error.message : 'Could not load cross-references for some roles.';
            }
        }

        rolesFetchedForCrossRef.value = true;
    } catch (error) {
        crossRefError.value = error instanceof Error ? error.message : 'Could not load role cross-references.';
    }
};

const loadMenuCrossReferences = async (): Promise<void> => {

    if (!canReadMenus.value) return;

    try {

        if (menusState.items.length === 0 && menusState.loadError == null) {
            await menusAdminStore.loadMenus();
        }
        if (menusState.loadError != null) return;

        for (const menu of menusState.items) {
            if (menusState.permissionsByMenu[menu.id] != null) continue;
            try {
                await menusAdminStore.loadPermissions(menu.id);
            } catch (error) {
                crossRefError.value = error instanceof Error ? error.message : 'Could not load cross-references for some menus.';
            }
        }

        menusFetchedForCrossRef.value = true;
    } catch (error) {
        crossRefError.value = error instanceof Error ? error.message : 'Could not load menu cross-references.';
    }
};

onMounted(async (): Promise<void> => {
    if (!hasPermission.value) return;
    await permissionsAdminStore.load();
    await Promise.all([loadRoleCrossReferences(), loadMenuCrossReferences()]);
});

const rolesGrantingKey = (keyName: string): AdminRole[] => {
    const out: AdminRole[] = [];
    for (const role of rolesState.items) {
        const keys = rolesState.permissionsByRole[role.id];
        if (keys != null && keys.includes(keyName)) {
            out.push(role);
        }
    }
    return out;
};

const menusGatedByKey = (keyName: string): AdminMenu[] => {
    const out: AdminMenu[] = [];
    for (const menu of menusState.items) {
        const keys = menusState.permissionsByMenu[menu.id];
        if (keys != null && keys.includes(keyName)) {
            out.push(menu);
        }
    }
    return out;
};
</script>

<template>
    <AccessDeniedPanel v-if="!hasPermission" />

    <div v-else class="space-y-5">
        <header>
            <p class="font-display text-xs uppercase tracking-[0.22em] text-accent">Admin</p>
            <h1 class="mt-1 text-2xl font-semibold text-ink">Permissions</h1>
            <p class="mt-1 text-sm text-slate-500">
                Read-only catalogue. Permission keys are code-coupled — they are seeded by the system and cannot be edited here.
            </p>
        </header>

        <div
            v-if="permState.loadError != null"
            class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            role="alert"
        >
            {{ permState.loadError }}
        </div>

        <div
            v-if="crossRefError != null"
            class="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800"
        >
            {{ crossRefError }}
        </div>

        <p v-if="permState.loading" class="text-sm text-slate-500">Loading…</p>

        <section
            v-for="group in groups"
            v-else
            :key="group.namespace"
            class="rounded-2xl border border-slate-200 bg-white shadow-soft"
        >
            <header class="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <h2 class="text-xs font-semibold uppercase tracking-[0.12em] text-accent">{{ group.label }}</h2>
                <span class="text-xs text-slate-500">{{ group.items.length }} permission(s)</span>
            </header>
            <ul class="divide-y divide-slate-100">
                <li v-for="perm in group.items" :key="perm.id" class="px-4 py-3">
                    <code class="font-mono text-sm text-ink">{{ perm.keyName }}</code>
                    <p v-if="perm.description != null" class="mt-1 text-xs text-slate-500">
                        {{ perm.description }}
                    </p>
                    <div class="mt-2 flex flex-col gap-1 text-xs">
                        <div v-if="rolesFetchedForCrossRef" class="flex flex-wrap items-center gap-1">
                            <template v-if="rolesGrantingKey(perm.keyName).length > 0">
                                <span class="text-slate-500">Granted to:</span>
                                <span
                                    v-for="role in rolesGrantingKey(perm.keyName)"
                                    :key="role.id"
                                    class="rounded bg-accent/10 px-2 py-0.5 font-medium text-accent"
                                >
                                    {{ role.name }}
                                </span>
                            </template>
                            <span v-else class="text-slate-400">Granted to: no role.</span>
                        </div>
                        <div v-if="menusFetchedForCrossRef" class="flex flex-wrap items-center gap-1">
                            <template v-if="menusGatedByKey(perm.keyName).length > 0">
                                <span class="text-slate-500">Gates menus:</span>
                                <span
                                    v-for="menu in menusGatedByKey(perm.keyName)"
                                    :key="menu.id"
                                    class="rounded bg-accentWarm/10 px-2 py-0.5 font-medium text-accentWarm"
                                >
                                    {{ menu.label }}
                                </span>
                            </template>
                            <span v-else class="text-slate-400">Gates menus: none.</span>
                        </div>
                    </div>
                </li>
            </ul>
        </section>
    </div>
</template>
