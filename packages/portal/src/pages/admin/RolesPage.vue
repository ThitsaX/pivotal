<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Copyright 2026 ThitsaWorks -->

<script setup lang="ts">
import {computed, onMounted, reactive, ref, watch} from 'vue';
import {ApiError} from '../../api/client';
import AccessDeniedPanel from '../../components/admin/AccessDeniedPanel.vue';
import AdminTable from '../../components/admin/AdminTable.vue';
import ConfirmDialog from '../../components/admin/ConfirmDialog.vue';
import PermissionSelector from '../../components/admin/PermissionSelector.vue';
import RevocationBanner from '../../components/admin/RevocationBanner.vue';
import {authStore} from '../../stores/auth.store';
import {permissionsAdminStore} from '../../stores/permissions-admin.store';
import {rolePresetsStore} from '../../stores/role-presets.store';
import {
    type AdminRole,
    type AdminRoleCreateInput,
    type RoleScope,
    rolesAdminStore,
} from '../../stores/roles-admin.store';

const hasPermission = computed((): boolean => authStore.hasPermission('admin.roles.manage'));

const state = rolesAdminStore.state;
const permState = permissionsAdminStore.state;
const presetState = rolePresetsStore.state;

const banner = ref<string | null>(null);

const setBanner = (message: string): void => {
    banner.value = message;
    window.setTimeout(() => { banner.value = null; }, 8000);
};

onMounted(async (): Promise<void> => {
    if (!hasPermission.value) return;
    await Promise.all([
        rolesAdminStore.loadRoles(),
        permissionsAdminStore.load(),
        rolePresetsStore.load(),
    ]);
});

// --- Create modal: 3-step flow ---------------------------------------------
interface CreateForm {
    step:             1 | 2 | 3;
    scope:            RoleScope | null;
    code:             string;
    name:             string;
    description:      string;
    presetKey:        string;          // '' = none
    selectedKeys:     string[];
    submitting:       boolean;
    error:            string | null;
}

const createOpen = ref(false);
const createForm = reactive<CreateForm>({
    step:         1,
    scope:        null,
    code:         '',
    name:         '',
    description:  '',
    presetKey:    '',
    selectedKeys: [],
    submitting:   false,
    error:        null,
});

const availablePresets = computed(() => {
    if (createForm.scope == null) return [];
    return rolePresetsStore.forScope(createForm.scope);
});

const step1NextDisabled = computed((): boolean => createForm.scope == null);

const step2NextDisabled = computed((): boolean => {
    if (createForm.code.trim().length === 0) return true;
    if (createForm.name.trim().length === 0) return true;
    return false;
});

const createSubmitDisabled = computed((): boolean => {
    if (createForm.submitting) return true;
    if (createForm.scope == null) return true;
    if (createForm.code.trim().length === 0) return true;
    if (createForm.name.trim().length === 0) return true;
    return false;
});

const openCreate = (): void => {
    createForm.step = 1;
    createForm.scope = null;
    createForm.code = '';
    createForm.name = '';
    createForm.description = '';
    createForm.presetKey = '';
    createForm.selectedKeys = [];
    createForm.submitting = false;
    createForm.error = null;
    createOpen.value = true;
};

const closeCreate = (): void => {
    if (!createForm.submitting) createOpen.value = false;
};

const hasTouchedStep2Or3 = (): boolean => {
    if (createForm.code.trim().length > 0) return true;
    if (createForm.name.trim().length > 0) return true;
    if (createForm.description.trim().length > 0) return true;
    if (createForm.presetKey.length > 0) return true;
    if (createForm.selectedKeys.length > 0) return true;
    return false;
};

const onScopeChange = (next: RoleScope): void => {
    if (createForm.scope === next) return;
    if (createForm.scope != null && hasTouchedStep2Or3()) {
        const ok = window.confirm('Changing scope will clear your selections in the next steps. Continue?');
        if (!ok) return;
        createForm.code = '';
        createForm.name = '';
        createForm.description = '';
        createForm.presetKey = '';
        createForm.selectedKeys = [];
    }
    createForm.scope = next;
};

const goToStep = (step: 1 | 2 | 3): void => {
    if (step < createForm.step) {
        createForm.error = null;
    }

    createForm.step = step;
};

const onPresetChange = (event: Event): void => {
    const value = (event.target as HTMLSelectElement).value;
    createForm.presetKey = value;
    if (value === '') {
        createForm.selectedKeys = [];
        return;
    }
    const preset = presetState.items.find((p) => p.key === value);
    if (preset != null) {
        // Snapshot copy — independent of preset after this point.
        createForm.selectedKeys = preset.permissionKeys.slice();
    }
};

const clearAllPermissions = (): void => {
    createForm.presetKey = '';
    createForm.selectedKeys = [];
};

const onCreatePermissionsChange = (next: string[]): void => {
    createForm.selectedKeys = next;
    // Manual edit breaks the preset binding — clear the dropdown selection so
    // it's clear the role is no longer "the preset, as-is."
    if (createForm.presetKey.length > 0) {
        const preset = presetState.items.find((p) => p.key === createForm.presetKey);
        if (preset == null) return;
        const sortedNext = next.slice().sort();
        const sortedPreset = preset.permissionKeys.slice().sort();
        if (sortedNext.length !== sortedPreset.length
            || sortedNext.some((k, i) => k !== sortedPreset[i])) {
            createForm.presetKey = '';
        }
    }
};

watch(() => [
    createForm.scope,
    createForm.code,
    createForm.name,
    createForm.description,
    createForm.presetKey,
], () => {
    createForm.error = null;
});

const submitCreate = async (): Promise<void> => {

    if (createSubmitDisabled.value) return;

    createForm.submitting = true;
    createForm.error = null;

    try {
        const input: AdminRoleCreateInput = {
            code:        createForm.code.trim().toUpperCase(),
            name:        createForm.name.trim(),
            scope:       createForm.scope!,
            description: createForm.description.trim().length > 0 ? createForm.description.trim() : null,
        };
        const created = await rolesAdminStore.createRole(input);
        if (createForm.selectedKeys.length > 0) {
            await rolesAdminStore.replacePermissions(created.id, createForm.selectedKeys);
        }
        createOpen.value = false;
        setBanner(`Role "${created.name}" created.`);
    } catch (error) {
        createForm.error = describeApiError(error);
    } finally {
        createForm.submitting = false;
    }
};

// --- Edit modal -------------------------------------------------------------
interface EditState {
    role:             AdminRole | null;
    name:             string;
    description:      string;
    initialKeys:      string[];
    selectedKeys:     string[];
    permsLoaded:      boolean;
    permsLoadError:   string | null;
    submitting:       boolean;
    saveError:        string | null;
}

const editState = reactive<EditState>({
    role:           null,
    name:           '',
    description:    '',
    initialKeys:    [],
    selectedKeys:   [],
    permsLoaded:    false,
    permsLoadError: null,
    submitting:     false,
    saveError:      null,
});

const editOpen = computed((): boolean => editState.role != null);

const openEdit = async (role: AdminRole): Promise<void> => {
    editState.role = role;
    editState.name = role.name;
    editState.description = role.description ?? '';
    editState.initialKeys = [];
    editState.selectedKeys = [];
    editState.permsLoaded = false;
    editState.permsLoadError = null;
    editState.submitting = false;
    editState.saveError = null;

    try {
        const keys = await rolesAdminStore.loadPermissions(role.id);
        editState.initialKeys = keys.slice().sort();
        editState.selectedKeys = keys.slice().sort();
        editState.permsLoaded = true;
    } catch (error) {
        editState.permsLoadError = describeApiError(error);
    }
};

const closeEdit = (): void => {
    if (!editState.submitting) editState.role = null;
};

const onEditPermissionsChange = (next: string[]): void => {
    editState.selectedKeys = next;
};

const detailsDirty = computed((): boolean => {
    if (editState.role == null) return false;
    if (editState.name.trim() !== editState.role.name) return true;
    const currentDescription = editState.description.trim().length > 0 ? editState.description.trim() : null;
    if (currentDescription !== editState.role.description) return true;
    return false;
});

const permissionsDirty = computed((): boolean => {
    if (editState.initialKeys.length !== editState.selectedKeys.length) return true;
    const a = editState.initialKeys.slice().sort();
    const b = editState.selectedKeys.slice().sort();
    for (let i = 0; i < a.length; i += 1) {
        if (a[i] !== b[i]) return true;
    }
    return false;
});

const editDirty = computed((): boolean => detailsDirty.value || permissionsDirty.value);

const editNameValidationMessage = computed((): string | null => {
    if (editState.role != null && editState.name.trim().length === 0) {
        return 'Display Name is required.';
    }

    return null;
});

const editSubmitDisabled = computed((): boolean => {
    if (editState.submitting) return true;
    if (!editDirty.value) return true;
    if (editNameValidationMessage.value != null) return true;
    return false;
});

const submitEdit = async (): Promise<void> => {

    if (editState.role == null || editSubmitDisabled.value) return;

    editState.submitting = true;
    editState.saveError = null;

    try {

        if (detailsDirty.value) {
            await rolesAdminStore.updateRole(editState.role.id, {
                name:        editState.name.trim(),
                description: editState.description.trim().length > 0 ? editState.description.trim() : null,
            });
        }

        if (permissionsDirty.value) {
            await rolesAdminStore.replacePermissions(editState.role.id, editState.selectedKeys);
            setBanner(`Permissions updated. Active sessions for ${editState.role.name} will end within seconds.`);
        }

        editState.role = null;
    } catch (error) {
        editState.saveError = describeApiError(error);
    } finally {
        editState.submitting = false;
    }
};

// --- Delete confirm ---------------------------------------------------------
const deleteTarget = ref<AdminRole | null>(null);
const deleteBusy = ref(false);
const deleteError = ref<string | null>(null);

const openDelete = (role: AdminRole): void => {
    deleteTarget.value = role;
    deleteBusy.value = false;
    deleteError.value = null;
};

const closeDelete = (): void => {
    if (!deleteBusy.value) deleteTarget.value = null;
};

const submitDelete = async (): Promise<void> => {

    if (deleteTarget.value == null || deleteBusy.value) return;

    deleteBusy.value = true;
    deleteError.value = null;

    try {
        const name = deleteTarget.value.name;
        await rolesAdminStore.deleteRole(deleteTarget.value.id);
        deleteTarget.value = null;
        setBanner(`${name} has been deleted.`);
    } catch (error) {
        deleteError.value = describeApiError(error);
    } finally {
        deleteBusy.value = false;
    }
};

// --- Helpers ----------------------------------------------------------------
function describeApiError(error: unknown): string {
    if (error instanceof ApiError) return error.message;
    if (error instanceof Error) return error.message;
    return 'Request failed.';
}

const scopeBadgeClass = (scope: RoleScope): string => {
    return scope === 'HUB'
        ? 'bg-blue-50 text-blue-700'
        : 'bg-purple-50 text-purple-700';
};

const columns = [
    {key: 'name',  label: 'Name'},
    {key: 'code',  label: 'Code'},
    {key: 'scope', label: 'Scope', width: '90px'},
    {key: 'users', label: 'Users',       align: 'right' as const, width: '90px'},
    {key: 'perms', label: 'Permissions', align: 'right' as const, width: '120px'},
];

watch(() => editState.role, (role) => {
    if (role == null) return;
    if (!permState.loaded && permState.loadError == null) {
        void permissionsAdminStore.load();
    }
});
</script>

<template>
    <AccessDeniedPanel v-if="!hasPermission" />

    <div v-else class="space-y-5">
        <header class="flex flex-wrap items-end justify-between gap-3">
            <div>
                <p class="font-display text-xs uppercase tracking-[0.22em] text-accent">Admin</p>
                <h1 class="mt-1 text-2xl font-semibold text-ink">Roles</h1>
                <p class="mt-1 text-sm text-slate-500">Define roles and the permissions they grant. System roles cannot be deleted.</p>
            </div>
            <button
                type="button"
                class="inline-flex items-center gap-2 rounded-lg bg-accentWarm px-3 py-2 text-sm font-semibold text-white shadow-soft transition hover:bg-accentWarm/90"
                @click="openCreate"
            >
                + Add role
            </button>
        </header>

        <RevocationBanner v-if="banner != null" :message="banner" />

        <AdminTable
            :columns="columns"
            :rows="state.items"
            :loading="state.loading"
            :error="state.loadError"
            empty-text="No roles yet."
        >
            <template #cell="{row, column}">
                <template v-if="column.key === 'name'">
                    <span class="font-medium text-ink">{{ row.name }}</span>
                    <span
                        v-if="row.isSystem"
                        class="ml-2 rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600"
                        title="Seeded by the system; cannot be deleted."
                    >
                        system
                    </span>
                    <div v-if="row.description != null" class="text-xs text-slate-500">{{ row.description }}</div>
                </template>
                <template v-else-if="column.key === 'code'">
                    <code class="font-mono text-xs text-slate-700">{{ row.code }}</code>
                </template>
                <template v-else-if="column.key === 'scope'">
                    <span :class="['rounded-full px-2 py-0.5 text-xs font-semibold', scopeBadgeClass(row.scope)]">
                        {{ row.scope }}
                    </span>
                </template>
                <template v-else-if="column.key === 'users'">
                    {{ row.userCount }}
                </template>
                <template v-else-if="column.key === 'perms'">
                    {{ row.permissionCount }}
                </template>
            </template>

            <template #actions="{row}">
                <div class="flex justify-end gap-2">
                    <button
                        type="button"
                        class="text-xs font-medium text-accent transition hover:underline"
                        @click="openEdit(row)"
                    >
                        Edit
                    </button>
                    <button
                        type="button"
                        class="text-xs font-medium text-red-600 transition hover:underline disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline"
                        :disabled="row.isSystem || row.userCount > 0"
                        :title="row.isSystem
                            ? 'System roles cannot be deleted.'
                            : (row.userCount > 0 ? 'This role is assigned to one or more users.' : undefined)"
                        @click="openDelete(row)"
                    >
                        Delete
                    </button>
                </div>
            </template>
        </AdminTable>

        <!-- Create modal — 3-step flow -->
        <div
            v-if="createOpen"
            class="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/40 px-4 py-8"
            role="dialog"
            aria-modal="true"
        >
            <div class="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-soft">
                <header class="flex items-start justify-between gap-3">
                    <div>
                        <h2 class="text-base font-semibold text-ink">Add role</h2>
                        <p class="mt-0.5 text-xs text-slate-500">
                            Step {{ createForm.step }} of 3
                            <span v-if="createForm.scope != null" class="ml-1">
                                · scope
                                <span :class="['ml-1 rounded-full px-2 py-0.5 text-xs font-semibold', scopeBadgeClass(createForm.scope)]">
                                    {{ createForm.scope }}
                                </span>
                            </span>
                        </p>
                    </div>
                    <button
                        type="button"
                        class="text-sm text-slate-400 transition hover:text-ink"
                        :disabled="createForm.submitting"
                        @click="closeCreate"
                    >
                        ✕
                    </button>
                </header>

                <!-- Step 1: scope -->
                <div v-if="createForm.step === 1" class="mt-4 space-y-3">
                    <p class="text-sm text-slate-600">
                        Choose whether this role grants hub-wide powers or operates within a single FSP.
                        This choice is permanent — to change scope later, delete the role and create a new one.
                    </p>
                    <div class="space-y-2">
                        <label
                            class="flex cursor-pointer items-start gap-3 rounded-lg border-2 px-3 py-3 transition"
                            :class="createForm.scope === 'HUB' ? 'border-accent bg-accent/5' : 'border-slate-200 hover:border-slate-300'"
                        >
                            <input
                                type="radio"
                                name="role-scope"
                                value="HUB"
                                :checked="createForm.scope === 'HUB'"
                                class="mt-1 h-4 w-4 text-accent focus:ring-accent"
                                @change="onScopeChange('HUB')"
                            >
                            <div class="flex-1">
                                <div class="flex items-center gap-2">
                                    <span class="text-sm font-semibold text-ink">HUB</span>
                                    <span class="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                                        Hub operator
                                    </span>
                                </div>
                                <p class="mt-0.5 text-xs text-slate-500">
                                    Cross-FSP rights: onboarding, hub-level currency, signing keys, audit across all FSPs, user/role administration.
                                    Users with this role have no fspId.
                                </p>
                            </div>
                        </label>
                        <label
                            class="flex cursor-pointer items-start gap-3 rounded-lg border-2 px-3 py-3 transition"
                            :class="createForm.scope === 'DFSP' ? 'border-accent bg-accent/5' : 'border-slate-200 hover:border-slate-300'"
                        >
                            <input
                                type="radio"
                                name="role-scope"
                                value="DFSP"
                                :checked="createForm.scope === 'DFSP'"
                                class="mt-1 h-4 w-4 text-accent focus:ring-accent"
                                @change="onScopeChange('DFSP')"
                            >
                            <div class="flex-1">
                                <div class="flex items-center gap-2">
                                    <span class="text-sm font-semibold text-ink">DFSP</span>
                                    <span class="rounded-full bg-purple-50 px-2 py-0.5 text-xs font-semibold text-purple-700">
                                        FSP-scoped
                                    </span>
                                </div>
                                <p class="mt-0.5 text-xs text-slate-500">
                                    Scoped to a single FSP. Audit and FSP-side actions only — no hub administration.
                                    Users with this role must have an fspId.
                                </p>
                            </div>
                        </label>
                    </div>

                    <div class="mt-5 flex justify-end gap-2">
                        <button
                            type="button"
                            class="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-ink transition hover:bg-slate-50"
                            @click="closeCreate"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            class="rounded-lg bg-accentWarm px-3 py-2 text-sm font-semibold text-white transition hover:bg-accentWarm/90 disabled:cursor-not-allowed disabled:opacity-60"
                            :disabled="step1NextDisabled"
                            @click="goToStep(2)"
                        >
                            Continue
                        </button>
                    </div>
                </div>

                <!-- Step 2: code, name, description, preset -->
                <form v-else-if="createForm.step === 2" class="mt-4 space-y-3" @submit.prevent="goToStep(3)">
                    <div>
                        <label class="block text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">Code</label>
                        <input
                            v-model="createForm.code"
                            type="text"
                            placeholder="e.g. ONBOARDERS"
                            required
                            class="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono text-ink uppercase focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                        >
                        <p class="mt-1 text-xs text-slate-500">Immutable after creation. Used as a stable identifier in code.</p>
                    </div>
                    <div>
                        <label class="block text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">Display name</label>
                        <input
                            v-model="createForm.name"
                            type="text"
                            required
                            class="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                        >
                    </div>
                    <div>
                        <label class="block text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">Description</label>
                        <textarea
                            v-model="createForm.description"
                            rows="2"
                            class="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                        />
                    </div>
                    <div>
                        <label class="block text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">
                            Start from preset
                            <span class="font-normal normal-case text-slate-400">— optional</span>
                        </label>
                        <select
                            :value="createForm.presetKey"
                            class="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                            @change="onPresetChange"
                        >
                            <option value="">— No preset (start with no permissions) —</option>
                            <option v-for="preset in availablePresets" :key="preset.key" :value="preset.key">
                                {{ preset.label }}
                            </option>
                        </select>
                        <p
                            v-if="createForm.presetKey.length > 0"
                            class="mt-1 text-xs text-slate-500"
                        >
                            {{ availablePresets.find((p) => p.key === createForm.presetKey)?.description }}
                            You can adjust the selection in the next step — your edits won't sync back to the preset.
                        </p>
                    </div>

                    <div class="mt-5 flex justify-end gap-2">
                        <button
                            type="button"
                            class="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-ink transition hover:bg-slate-50"
                            @click="goToStep(1)"
                        >
                            Back
                        </button>
                        <button
                            type="submit"
                            class="rounded-lg bg-accentWarm px-3 py-2 text-sm font-semibold text-white transition hover:bg-accentWarm/90 disabled:cursor-not-allowed disabled:opacity-60"
                            :disabled="step2NextDisabled"
                        >
                            Continue
                        </button>
                    </div>
                </form>

                <!-- Step 3: permissions -->
                <form v-else class="mt-4 space-y-3" @submit.prevent="submitCreate">
                    <div class="flex items-center justify-between">
                        <h3 class="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">Granted permissions</h3>
                        <button
                            type="button"
                            class="text-xs font-medium text-slate-500 transition hover:text-ink disabled:cursor-not-allowed"
                            :disabled="createForm.selectedKeys.length === 0 || createForm.submitting"
                            @click="clearAllPermissions"
                        >
                            Clear all
                        </button>
                    </div>
                    <p v-if="permState.loadError != null" class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                        Could not load the permission catalogue: {{ permState.loadError }}
                    </p>
                    <PermissionSelector
                        v-else-if="permState.loaded"
                        :available-permissions="permState.items"
                        :model-value="createForm.selectedKeys"
                        :scope-filter="createForm.scope ?? undefined"
                        :disabled="createForm.submitting"
                        @update:model-value="onCreatePermissionsChange"
                    />
                    <p v-else class="text-sm text-slate-500">Loading permissions…</p>

                    <div
                        v-if="createForm.error != null"
                        class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
                        role="alert"
                    >
                        {{ createForm.error }}
                    </div>

                    <div class="mt-5 flex justify-end gap-2">
                        <button
                            type="button"
                            class="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-ink transition hover:bg-slate-50"
                            :disabled="createForm.submitting"
                            @click="goToStep(2)"
                        >
                            Back
                        </button>
                        <button
                            type="submit"
                            class="rounded-lg bg-accentWarm px-3 py-2 text-sm font-semibold text-white transition hover:bg-accentWarm/90 disabled:cursor-not-allowed disabled:opacity-60"
                            :disabled="createSubmitDisabled"
                        >
                            {{ createForm.submitting ? 'Creating…' : 'Create role' }}
                        </button>
                    </div>
                </form>
            </div>
        </div>

        <!-- Edit modal -->
        <div
            v-if="editOpen"
            class="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/40 px-4 py-8"
            role="dialog"
            aria-modal="true"
        >
            <div class="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-soft">
                <header class="flex items-start justify-between gap-3">
                    <div>
                        <h2 class="text-base font-semibold text-ink">Edit role</h2>
                        <p class="mt-0.5 text-xs text-slate-500">
                            <code class="font-mono">{{ editState.role?.code }}</code>
                            <span
                                v-if="editState.role != null"
                                :class="['ml-2 rounded-full px-2 py-0.5 text-xs font-semibold', scopeBadgeClass(editState.role.scope)]"
                            >
                                {{ editState.role.scope }}
                            </span>
                            <span
                                v-if="editState.role?.isSystem"
                                class="ml-2 rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600"
                            >
                                system role — admin.* permissions cannot be removed
                            </span>
                        </p>
                    </div>
                    <button
                        type="button"
                        class="text-sm text-slate-400 transition hover:text-ink"
                        :disabled="editState.submitting"
                        @click="closeEdit"
                    >
                        ✕
                    </button>
                </header>

                <form class="mt-4 space-y-4" @submit.prevent="submitEdit">
                    <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div>
                            <label class="block text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">Display name</label>
                            <input
                                v-model="editState.name"
                                type="text"
                                required
                                :aria-invalid="editNameValidationMessage != null"
                                class="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                            >
                            <p v-if="editNameValidationMessage != null" class="mt-1 text-xs text-red-600">
                                {{ editNameValidationMessage }}
                            </p>
                        </div>
                        <div>
                            <label class="block text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">Description</label>
                            <input
                                v-model="editState.description"
                                type="text"
                                class="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                            >
                        </div>
                    </div>

                    <div>
                        <h3 class="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">Granted permissions</h3>
                        <p v-if="editState.permsLoadError != null" class="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                            {{ editState.permsLoadError }}
                        </p>
                        <p v-else-if="!editState.permsLoaded" class="mt-2 text-sm text-slate-500">
                            Loading permissions…
                        </p>
                        <p v-else-if="permState.loadError != null" class="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                            Could not load the permission catalogue: {{ permState.loadError }}
                        </p>
                        <PermissionSelector
                            v-else
                            class="mt-2"
                            :available-permissions="permState.items"
                            :model-value="editState.selectedKeys"
                            :scope-filter="editState.role?.scope"
                            :lock-admin-keys="editState.role?.isSystem === true"
                            :disabled="editState.submitting"
                            @update:model-value="onEditPermissionsChange"
                        />
                    </div>

                    <RevocationBanner v-if="permissionsDirty" />

                    <div
                        v-if="editState.saveError != null"
                        class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
                        role="alert"
                    >
                        {{ editState.saveError }}
                    </div>

                    <div class="flex justify-end gap-2">
                        <button
                            type="button"
                            class="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-ink transition hover:bg-slate-50"
                            :disabled="editState.submitting"
                            @click="closeEdit"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            class="rounded-lg bg-accentWarm px-3 py-2 text-sm font-semibold text-white transition hover:bg-accentWarm/90 disabled:cursor-not-allowed disabled:opacity-60"
                            :disabled="editSubmitDisabled"
                        >
                            {{ editState.submitting ? 'Saving…' : 'Save changes' }}
                        </button>
                    </div>
                </form>
            </div>
        </div>

        <!-- Delete confirm -->
        <ConfirmDialog
            :open="deleteTarget != null"
            title="Delete role"
            :message="`Permanently delete the role &quot;${deleteTarget?.name}&quot;? Its permission grants will also be removed. This cannot be undone.`"
            :confirm-token="deleteTarget?.code"
            :busy="deleteBusy"
            :error-message="deleteError"
            confirm-label="Delete role"
            tone="danger"
            @confirm="submitDelete"
            @cancel="closeDelete"
        />
    </div>
</template>
