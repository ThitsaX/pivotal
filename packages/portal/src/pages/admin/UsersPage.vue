<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Copyright 2026 ThitsaWorks -->

<script setup lang="ts">
import {computed, onMounted, reactive, ref, watch} from 'vue';
import {ApiError} from '../../api/client';
import AccessDeniedPanel from '../../components/admin/AccessDeniedPanel.vue';
import AdminTable from '../../components/admin/AdminTable.vue';
import ConfirmDialog from '../../components/admin/ConfirmDialog.vue';
import RevocationBanner from '../../components/admin/RevocationBanner.vue';
import TempPasswordReveal from '../../components/admin/TempPasswordReveal.vue';
import {authStore} from '../../stores/auth.store';
import {
    type AdminUser,
    type AdminUserCreateInput,
    type AdminUserUpdateInput,
    usersAdminStore,
} from '../../stores/users-admin.store';

const props = defineProps<{
    selectedTimeZone: string;
}>();

defineEmits<{
    (event: 'update:selectedTimeZone', value: string): void;
}>();

const hasPermission = computed((): boolean => authStore.hasPermission('admin.users.manage'));
const currentUserId = computed((): string | null => authStore.state.user?.id ?? null);

const state = usersAdminStore.state;

const searchDraft = ref('');
const isActiveFilter = ref<'all' | 'active' | 'inactive'>('all');
const roleFilter = ref('');

const reload = async (): Promise<void> => {
    await usersAdminStore.loadUsers();
};

const applyFilters = async (): Promise<void> => {
    usersAdminStore.setFilters({
        search:   searchDraft.value.trim().length > 0 ? searchDraft.value.trim() : undefined,
        roleId:   roleFilter.value.length > 0 ? roleFilter.value : undefined,
        isActive: isActiveFilter.value === 'all' ? undefined : isActiveFilter.value === 'active',
    });
    await reload();
};

const clearFilters = async (): Promise<void> => {
    searchDraft.value = '';
    isActiveFilter.value = 'all';
    roleFilter.value = '';
    usersAdminStore.clearFilters();
    await reload();
};

onMounted(async (): Promise<void> => {
    if (!hasPermission.value) return;
    await Promise.all([usersAdminStore.loadUsers(), usersAdminStore.loadRoles()]);
});

// --- Create modal -----------------------------------------------------------
interface CreateFormState {
    email:    string;
    roleId:   string;
    fspId:    string;
    submitting: boolean;
    error:    string | null;
}

const createOpen = ref(false);
const createForm = reactive<CreateFormState>({
    email: '', roleId: '', fspId: '', submitting: false, error: null,
});

const createRoleForbidsFspId = computed((): boolean => {
    const role = state.roles.find((r) => r.id === createForm.roleId);
    return role?.scope === 'HUB';
});

const createRoleRequiresFspId = computed((): boolean => {
    const role = state.roles.find((r) => r.id === createForm.roleId);
    return role?.scope === 'DFSP';
});

const createDisabled = computed((): boolean => {

    if (createForm.submitting) return true;
    if (createForm.email.trim().length === 0) return true;
    if (createForm.roleId.length === 0) return true;
    if (createRoleRequiresFspId.value && createForm.fspId.trim().length === 0) return true;
    return false;
});

const openCreate = (): void => {
    createForm.email = '';
    createForm.roleId = '';
    createForm.fspId = '';
    createForm.error = null;
    createForm.submitting = false;
    createOpen.value = true;
};

const closeCreate = (): void => {
    if (!createForm.submitting) createOpen.value = false;
};

watch(() => createForm.roleId, () => {
    if (createRoleForbidsFspId.value) {
        createForm.fspId = '';
    }
});

const submitCreate = async (): Promise<void> => {

    if (createDisabled.value) return;

    createForm.submitting = true;
    createForm.error = null;

    try {
        const input: AdminUserCreateInput = {
            email:  createForm.email.trim(),
            roleId: createForm.roleId,
            fspId:  createRoleForbidsFspId.value ? null : createForm.fspId.trim(),
        };
        const result = await usersAdminStore.createUser(input);
        createOpen.value = false;
        showTempPassword(result.user.email, result.tempPassword, 'New user created');
    } catch (error) {
        createForm.error = describeApiError(error);
    } finally {
        createForm.submitting = false;
    }
};

// --- Edit modal -------------------------------------------------------------
interface EditFormState {
    user:     AdminUser | null;
    roleId:   string;
    fspId:    string;
    isActive: boolean;
    submitting: boolean;
    error:    string | null;
}

const editForm = reactive<EditFormState>({
    user: null, roleId: '', fspId: '', isActive: true, submitting: false, error: null,
});

const editOpen = computed((): boolean => editForm.user != null);
const editIsSelf = computed((): boolean => editForm.user != null && editForm.user.id === currentUserId.value);
const editRoleForbidsFspId = computed((): boolean => {
    const role = state.roles.find((r) => r.id === editForm.roleId);
    return role?.scope === 'HUB';
});

const openEdit = (user: AdminUser): void => {
    editForm.user = user;
    editForm.roleId = user.role.id;
    editForm.fspId = user.fspId ?? '';
    editForm.isActive = user.isActive;
    editForm.submitting = false;
    editForm.error = null;
};

const closeEdit = (): void => {
    if (!editForm.submitting) editForm.user = null;
};

watch(() => editForm.roleId, () => {
    if (editRoleForbidsFspId.value) editForm.fspId = '';
});

const editDirty = computed((): boolean => {
    if (editForm.user == null) return false;
    if (editForm.roleId !== editForm.user.role.id) return true;
    if ((editForm.fspId.trim().length > 0 ? editForm.fspId.trim() : null) !== editForm.user.fspId) return true;
    if (editForm.isActive !== editForm.user.isActive) return true;
    return false;
});

const submitEdit = async (): Promise<void> => {

    if (editForm.user == null || editForm.submitting || !editDirty.value) return;

    editForm.submitting = true;
    editForm.error = null;

    try {
        const patch: AdminUserUpdateInput = {};
        if (!editIsSelf.value) {
            if (editForm.roleId !== editForm.user.role.id) {
                patch.roleId = editForm.roleId;
            }
            if (editForm.isActive !== editForm.user.isActive) {
                patch.isActive = editForm.isActive;
            }
        }
        const newFspId = editForm.fspId.trim().length > 0 ? editForm.fspId.trim() : null;
        if (newFspId !== editForm.user.fspId) {
            patch.fspId = newFspId;
        }
        await usersAdminStore.updateUser(editForm.user.id, patch);
        editForm.user = null;
    } catch (error) {
        editForm.error = describeApiError(error);
    } finally {
        editForm.submitting = false;
    }
};

// --- Reset password ---------------------------------------------------------
const resetTarget = ref<AdminUser | null>(null);
const resetBusy = ref(false);
const resetError = ref<string | null>(null);

const openReset = (user: AdminUser): void => {
    resetTarget.value = user;
    resetError.value = null;
    resetBusy.value = false;
};

const closeReset = (): void => {
    if (!resetBusy.value) resetTarget.value = null;
};

const submitReset = async (): Promise<void> => {

    if (resetTarget.value == null || resetBusy.value) return;

    resetBusy.value = true;
    resetError.value = null;

    try {
        const result = await usersAdminStore.resetPassword(resetTarget.value.id);
        const email = resetTarget.value.email;
        resetTarget.value = null;
        showTempPassword(email, result.tempPassword, 'Password reset');
    } catch (error) {
        resetError.value = describeApiError(error);
    } finally {
        resetBusy.value = false;
    }
};

// --- Deactivate -------------------------------------------------------------
const deactivateTarget = ref<AdminUser | null>(null);
const deactivateBusy = ref(false);
const deactivateError = ref<string | null>(null);
const deactivateBanner = ref<string | null>(null);

const openDeactivate = (user: AdminUser): void => {
    deactivateTarget.value = user;
    deactivateError.value = null;
    deactivateBusy.value = false;
};

const closeDeactivate = (): void => {
    if (!deactivateBusy.value) deactivateTarget.value = null;
};

const submitDeactivate = async (): Promise<void> => {

    if (deactivateTarget.value == null || deactivateBusy.value) return;

    deactivateBusy.value = true;
    deactivateError.value = null;

    try {
        const email = deactivateTarget.value.email;
        await usersAdminStore.deactivateUser(deactivateTarget.value.id);
        deactivateTarget.value = null;
        deactivateBanner.value = `${email} has been deactivated. Their active session will end within seconds.`;
        window.setTimeout(() => { deactivateBanner.value = null; }, 8000);
    } catch (error) {
        deactivateError.value = describeApiError(error);
    } finally {
        deactivateBusy.value = false;
    }
};

// --- Temp-password reveal ---------------------------------------------------
interface TempPasswordState {
    open:         boolean;
    title:        string;
    email:        string;
    tempPassword: string;
}

const tempPassword = reactive<TempPasswordState>({
    open: false, title: '', email: '', tempPassword: '',
});

const showTempPassword = (email: string, value: string, title: string): void => {
    tempPassword.email = email;
    tempPassword.tempPassword = value;
    tempPassword.title = title;
    tempPassword.open = true;
};

const closeTempPassword = (): void => {
    tempPassword.open = false;
    tempPassword.email = '';
    tempPassword.tempPassword = '';
};

// --- Helpers ----------------------------------------------------------------
function describeApiError(error: unknown): string {
    if (error instanceof ApiError) {
        return error.message;
    }
    if (error instanceof Error) {
        return error.message;
    }
    return 'Request failed.';
}

const formatDate = (value: string | null): string => {
    if (value == null) return '—';
    try {
        return new Intl.DateTimeFormat('en-GB', {
            timeZone: props.selectedTimeZone,
            year:     'numeric',
            month:    'short',
            day:      '2-digit',
            hour:     '2-digit',
            minute:   '2-digit',
            second:   '2-digit',
            hour12:   false,
        }).format(new Date(value));
    } catch {
        return value;
    }
};

const columns = [
    {key: 'email',    label: 'Email'},
    {key: 'role',     label: 'Role'},
    {key: 'fspId',    label: 'FSP ID'},
    {key: 'status',   label: 'Status'},
    {key: 'lastLogin', label: 'Last login'},
];

const onPageChange = async (page: number): Promise<void> => {
    usersAdminStore.setPage(page);
    await reload();
};
</script>

<template>
    <AccessDeniedPanel v-if="!hasPermission" />

    <div v-else class="space-y-5">
        <header class="flex flex-wrap items-end justify-between gap-3">
            <div>
                <p class="font-display text-xs uppercase tracking-[0.22em] text-accent">Admin</p>
                <h1 class="mt-1 text-2xl font-semibold text-ink">Users</h1>
                <p class="mt-1 text-sm text-slate-500">Manage portal accounts. Changes propagate to active sessions within seconds.</p>
            </div>
            <button
                type="button"
                class="inline-flex items-center gap-2 rounded-lg bg-accentWarm px-3 py-2 text-sm font-semibold text-white shadow-soft transition hover:bg-accentWarm/90"
                @click="openCreate"
            >
                + Add user
            </button>
        </header>

        <RevocationBanner v-if="deactivateBanner != null" :message="deactivateBanner" />

        <section class="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-soft md:grid-cols-[2fr_1fr_1fr_auto]">
            <div>
                <label class="block text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">Search</label>
                <input
                    v-model="searchDraft"
                    type="text"
                    placeholder="Email or FSP ID"
                    class="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                    @keyup.enter="applyFilters"
                >
            </div>
            <div>
                <label class="block text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">Role</label>
                <select
                    v-model="roleFilter"
                    class="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                >
                    <option value="">All</option>
                    <option v-for="role in state.roles" :key="role.id" :value="role.id">{{ role.name }}</option>
                </select>
            </div>
            <div>
                <label class="block text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">Status</label>
                <select
                    v-model="isActiveFilter"
                    class="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                >
                    <option value="all">All</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                </select>
            </div>
            <div class="flex items-end gap-2">
                <button
                    type="button"
                    class="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white transition hover:bg-accent/90"
                    @click="applyFilters"
                >
                    Apply
                </button>
                <button
                    type="button"
                    class="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-ink transition hover:bg-slate-50"
                    @click="clearFilters"
                >
                    Clear
                </button>
            </div>
        </section>

        <p v-if="state.rolesError != null" class="text-xs text-amber-700">
            Could not load role options ({{ state.rolesError }}). Role filtering and editing may be limited.
        </p>

        <AdminTable
            :columns="columns"
            :rows="state.items"
            :loading="state.loading"
            :error="state.loadError"
            :total="state.total"
            :page="state.page"
            :page-size="state.pageSize"
            empty-text="No users match these filters."
            @page-change="onPageChange"
        >
            <template #cell="{row, column}">
                <template v-if="column.key === 'email'">
                    <span class="font-medium text-ink">{{ row.email }}</span>
                    <span v-if="row.id === currentUserId" class="ml-2 rounded bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent">You</span>
                </template>
                <template v-else-if="column.key === 'role'">
                    {{ row.role.name }}
                </template>
                <template v-else-if="column.key === 'fspId'">
                    <span :class="row.fspId == null ? 'text-slate-400' : 'font-mono text-ink'">
                        {{ row.fspId ?? '—' }}
                    </span>
                </template>
                <template v-else-if="column.key === 'status'">
                    <span
                        :class="[
                            'rounded-full px-2 py-0.5 text-xs font-semibold',
                            row.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500',
                        ]"
                    >
                        {{ row.isActive ? 'Active' : 'Inactive' }}
                    </span>
                </template>
                <template v-else-if="column.key === 'lastLogin'">
                    <span class="text-slate-500">{{ formatDate(row.lastLoginAt) }}</span>
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
                        class="text-xs font-medium text-accent transition hover:underline"
                        @click="openReset(row)"
                    >
                        Reset password
                    </button>
                    <button
                        v-if="row.isActive && row.id !== currentUserId"
                        type="button"
                        class="text-xs font-medium text-red-600 transition hover:underline"
                        @click="openDeactivate(row)"
                    >
                        Deactivate
                    </button>
                </div>
            </template>
        </AdminTable>

        <!-- Create modal -->
        <div
            v-if="createOpen"
            class="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 px-4"
            role="dialog"
            aria-modal="true"
        >
            <div class="w-full max-w-md rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-soft">
                <h2 class="text-base font-semibold text-ink">Add user</h2>
                <p class="mt-1 text-sm text-slate-500">A temporary password will be generated and shown once.</p>

                <form class="mt-4 space-y-3" @submit.prevent="submitCreate">
                    <div>
                        <label class="block text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">Email</label>
                        <input
                            v-model="createForm.email"
                            type="email"
                            autocomplete="off"
                            required
                            class="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                        >
                    </div>
                    <div>
                        <label class="block text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">Role</label>
                        <select
                            v-model="createForm.roleId"
                            required
                            class="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                        >
                            <option value="">Select a role…</option>
                            <option v-for="role in state.roles" :key="role.id" :value="role.id">{{ role.name }}</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">
                            FSP ID
                            <span v-if="createRoleForbidsFspId" class="font-normal normal-case text-slate-400">— not used for HUB-scoped roles</span>
                            <span v-else-if="createRoleRequiresFspId" class="font-normal normal-case text-slate-400">— required</span>
                        </label>
                        <input
                            v-model="createForm.fspId"
                            type="text"
                            :disabled="createRoleForbidsFspId"
                            class="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:bg-slate-50 disabled:text-slate-400"
                        >
                    </div>

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
                            @click="closeCreate"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            class="rounded-lg bg-accentWarm px-3 py-2 text-sm font-semibold text-white transition hover:bg-accentWarm/90 disabled:cursor-not-allowed disabled:opacity-60"
                            :disabled="createDisabled"
                        >
                            {{ createForm.submitting ? 'Creating…' : 'Create user' }}
                        </button>
                    </div>
                </form>
            </div>
        </div>

        <!-- Edit modal -->
        <div
            v-if="editOpen"
            class="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 px-4"
            role="dialog"
            aria-modal="true"
        >
            <div class="w-full max-w-md rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-soft">
                <h2 class="text-base font-semibold text-ink">Edit user</h2>
                <p class="mt-1 break-all text-sm text-slate-500">{{ editForm.user?.email }}</p>

                <p v-if="editIsSelf" class="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    You cannot change your own role or active status — only an administrator with another account can.
                </p>

                <form class="mt-4 space-y-3" @submit.prevent="submitEdit">
                    <div>
                        <label class="block text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">Role</label>
                        <select
                            v-model="editForm.roleId"
                            :disabled="editIsSelf"
                            class="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:bg-slate-50 disabled:text-slate-400"
                        >
                            <option v-for="role in state.roles" :key="role.id" :value="role.id">{{ role.name }}</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">
                            FSP ID
                            <span v-if="editRoleForbidsFspId" class="font-normal normal-case text-slate-400">— not used for HUB-scoped roles</span>
                        </label>
                        <input
                            v-model="editForm.fspId"
                            type="text"
                            :disabled="editRoleForbidsFspId"
                            class="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:bg-slate-50 disabled:text-slate-400"
                        >
                    </div>
                    <label class="flex items-center gap-2 text-sm text-ink">
                        <input
                            v-model="editForm.isActive"
                            type="checkbox"
                            :disabled="editIsSelf"
                            class="h-4 w-4 rounded border-slate-300 text-accent focus:ring-accent disabled:cursor-not-allowed"
                        >
                        Active
                    </label>

                    <RevocationBanner v-if="editDirty" />

                    <div
                        v-if="editForm.error != null"
                        class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
                        role="alert"
                    >
                        {{ editForm.error }}
                    </div>

                    <div class="mt-5 flex justify-end gap-2">
                        <button
                            type="button"
                            class="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-ink transition hover:bg-slate-50"
                            :disabled="editForm.submitting"
                            @click="closeEdit"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            class="rounded-lg bg-accentWarm px-3 py-2 text-sm font-semibold text-white transition hover:bg-accentWarm/90 disabled:cursor-not-allowed disabled:opacity-60"
                            :disabled="editForm.submitting || !editDirty"
                        >
                            {{ editForm.submitting ? 'Saving…' : 'Save changes' }}
                        </button>
                    </div>
                </form>
            </div>
        </div>

        <!-- Reset password confirm -->
        <ConfirmDialog
            :open="resetTarget != null"
            title="Reset password"
            :message="`Generate a new temporary password for ${resetTarget?.email}? Their active sessions will be revoked within seconds.`"
            :confirm-token="resetTarget?.email"
            :busy="resetBusy"
            :error-message="resetError"
            confirm-label="Reset password"
            tone="primary"
            @confirm="submitReset"
            @cancel="closeReset"
        />

        <!-- Deactivate confirm -->
        <ConfirmDialog
            :open="deactivateTarget != null"
            title="Deactivate user"
            :message="`Deactivate ${deactivateTarget?.email}? They will be signed out within seconds and cannot sign in again until reactivated.`"
            :confirm-token="deactivateTarget?.email"
            :busy="deactivateBusy"
            :error-message="deactivateError"
            confirm-label="Deactivate"
            tone="danger"
            @confirm="submitDeactivate"
            @cancel="closeDeactivate"
        />

        <!-- Temp-password reveal -->
        <TempPasswordReveal
            :open="tempPassword.open"
            :title="tempPassword.title"
            :user-email="tempPassword.email"
            :temp-password="tempPassword.tempPassword"
            @close="closeTempPassword"
        />
    </div>
</template>
