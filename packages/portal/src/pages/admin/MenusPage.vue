<script setup lang="ts">
import {computed, onMounted, reactive, ref} from 'vue';
import {ApiError} from '../../api/client';
import AccessDeniedPanel from '../../components/admin/AccessDeniedPanel.vue';
import ConfirmDialog from '../../components/admin/ConfirmDialog.vue';
import RevocationBanner from '../../components/admin/RevocationBanner.vue';
import {KNOWN_VIEW_KEYS} from '../../modules/audit/view-keys';
import {authStore} from '../../stores/auth.store';
import {loadMenuStore} from '../../stores/menu.store';
import {
    type AdminMenu,
    type AdminMenuCreateInput,
    type AdminMenuUpdateInput,
    menusAdminStore,
} from '../../stores/menus-admin.store';

const hasPermission = computed((): boolean => authStore.hasPermission('admin.menus.manage'));

const state = menusAdminStore.state;

// Distinct existing group labels, sorted — drives the Group <select> in both modals.
const availableGroups = computed((): string[] => {
    return Array.from(new Set(state.items.map((m) => m.groupLabel))).sort((a, b) => a.localeCompare(b));
});

const knownKeySet = new Set<string>(KNOWN_VIEW_KEYS);
const isKnownMenuKey = (key: string): boolean => knownKeySet.has(key);

const banner = ref<string | null>(null);
const setBanner = (message: string): void => {
    banner.value = message;
    window.setTimeout(() => { banner.value = null; }, 8000);
};

onMounted(async (): Promise<void> => {
    if (!hasPermission.value) return;
    await menusAdminStore.loadMenus();
});

// --- Create modal -----------------------------------------------------------
interface CreateForm {
    menuKey:     string;
    groupLabel:  string;
    label:       string;
    route:       string;
    sortOrder:   number;
    submitting:  boolean;
    error:       string | null;
}

const createOpen = ref(false);
const createForm = reactive<CreateForm>({
    menuKey: '', groupLabel: '', label: '', route: '',
    sortOrder: 0, submitting: false, error: null,
});
const createGroupMode = ref<'pick' | 'new'>('pick');

const onCreateGroupSelectChange = (event: Event): void => {
    const value = (event.target as HTMLSelectElement).value;
    if (value === '__new__') {
        createGroupMode.value = 'new';
        createForm.groupLabel = '';
    } else {
        createForm.groupLabel = value;
    }
};

const cancelCreateNewGroup = (): void => {
    createGroupMode.value = 'pick';
    createForm.groupLabel = '';
};

const createUnknownKeyWarning = computed((): string | null => {
    const key = createForm.menuKey.trim();
    if (key.length === 0) return null;
    if (isKnownMenuKey(key)) return null;
    return 'This menu key has no matching frontend page — it will be hidden by the sidebar per AC-7.4 until the frontend is updated.';
});

const createDisabled = computed((): boolean => {
    if (createForm.submitting) return true;
    if (createForm.menuKey.trim().length === 0) return true;
    if (createForm.groupLabel.trim().length === 0) return true;
    if (createForm.label.trim().length === 0) return true;
    if (createForm.route.trim().length === 0) return true;
    return false;
});

const openCreate = (): void => {
    createForm.menuKey = '';
    createForm.groupLabel = '';
    createForm.label = '';
    createForm.route = '';
    createForm.sortOrder = 0;
    createForm.submitting = false;
    createForm.error = null;
    createGroupMode.value = 'pick';
    createOpen.value = true;
};

const closeCreate = (): void => {
    if (!createForm.submitting) createOpen.value = false;
};

const submitCreate = async (): Promise<void> => {

    if (createDisabled.value) return;

    createForm.submitting = true;
    createForm.error = null;

    try {
        const input: AdminMenuCreateInput = {
            menuKey:    createForm.menuKey.trim(),
            groupLabel: createForm.groupLabel.trim(),
            label:      createForm.label.trim(),
            route:      createForm.route.trim(),
            sortOrder:  Number.isFinite(createForm.sortOrder) ? createForm.sortOrder : 0,
        };
        await menusAdminStore.createMenu(input);
        createOpen.value = false;
    } catch (error) {
        createForm.error = describeApiError(error);
    } finally {
        createForm.submitting = false;
    }
};

// --- Edit modal -------------------------------------------------------------
interface EditState {
    menu:            AdminMenu | null;
    groupLabel:      string;
    label:           string;
    route:           string;
    sortOrder:       number;
    permissionKeys:  string[];
    permsLoaded:     boolean;
    permsLoadError:  string | null;
    submitting:      boolean;
    saveError:       string | null;
}

const editState = reactive<EditState>({
    menu:           null,
    groupLabel:     '',
    label:          '',
    route:          '',
    sortOrder:      0,
    permissionKeys: [],
    permsLoaded:    false,
    permsLoadError: null,
    submitting:     false,
    saveError:      null,
});

const editOpen = computed((): boolean => editState.menu != null);

const editGroupMode = ref<'pick' | 'new'>('pick');

const onEditGroupSelectChange = (event: Event): void => {
    const value = (event.target as HTMLSelectElement).value;
    if (value === '__new__') {
        editGroupMode.value = 'new';
        editState.groupLabel = '';
    } else {
        editState.groupLabel = value;
    }
};

const cancelEditNewGroup = (): void => {
    editGroupMode.value = 'pick';
    editState.groupLabel = editState.menu?.groupLabel ?? '';
};

const openEdit = async (menu: AdminMenu): Promise<void> => {
    editState.menu = menu;
    editState.groupLabel = menu.groupLabel;
    editState.label = menu.label;
    editState.route = menu.route;
    editState.sortOrder = menu.sortOrder;
    editGroupMode.value = 'pick';
    editState.permissionKeys = [];
    editState.permsLoaded = false;
    editState.permsLoadError = null;
    editState.submitting = false;
    editState.saveError = null;

    try {
        const keys = await menusAdminStore.loadPermissions(menu.id);
        editState.permissionKeys = keys.slice().sort();
        editState.permsLoaded = true;
    } catch (error) {
        editState.permsLoadError = describeApiError(error);
    }
};

const closeEdit = (): void => {
    if (!editState.submitting) editState.menu = null;
};

const editDirty = computed((): boolean => {
    if (editState.menu == null) return false;
    const m = editState.menu;
    if (editState.groupLabel.trim() !== m.groupLabel) return true;
    if (editState.label.trim() !== m.label) return true;
    if (editState.route.trim() !== m.route) return true;
    if (editState.sortOrder !== m.sortOrder) return true;
    return false;
});

const submitEdit = async (): Promise<void> => {

    if (editState.menu == null || editState.submitting || !editDirty.value) return;

    editState.submitting = true;
    editState.saveError = null;

    try {
        const patch: AdminMenuUpdateInput = {
            groupLabel: editState.groupLabel.trim(),
            label:      editState.label.trim(),
            route:      editState.route.trim(),
            sortOrder:  editState.sortOrder,
        };
        await menusAdminStore.updateMenu(editState.menu.id, patch);

        editState.menu = null;
    } catch (error) {
        editState.saveError = describeApiError(error);
    } finally {
        editState.submitting = false;
    }
};

// --- Delete confirm ---------------------------------------------------------
const deleteTarget = ref<AdminMenu | null>(null);
const deleteBusy = ref(false);
const deleteError = ref<string | null>(null);

const deleteWarning = computed((): string | null => {
    if (deleteTarget.value == null) return null;
    if (!isKnownMenuKey(deleteTarget.value.menuKey)) return null;
    return 'This menu is part of the built-in sidebar set. Reseeding the database will bring it back; otherwise it stays deleted.';
});

const openDelete = (menu: AdminMenu): void => {
    deleteTarget.value = menu;
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
        const label = deleteTarget.value.label;
        await menusAdminStore.deleteMenu(deleteTarget.value.id);
        deleteTarget.value = null;
        setBanner(`${label} has been deleted.`);
        void loadMenuStore();
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
</script>

<template>
    <AccessDeniedPanel v-if="!hasPermission" />

    <div v-else class="space-y-5">
        <header class="flex flex-wrap items-end justify-between gap-3">
            <div>
                <p class="font-display text-xs uppercase tracking-[0.22em] text-accent">Admin</p>
                <h1 class="mt-1 text-2xl font-semibold text-ink">Menus</h1>
                <p class="mt-1 text-sm text-slate-500">Sidebar entries are computed live from menu-permission grants. Hide a menu by deactivating it.</p>
            </div>
            <button
                type="button"
                class="inline-flex items-center gap-2 rounded-lg bg-accentWarm px-3 py-2 text-sm font-semibold text-white shadow-soft transition hover:bg-accentWarm/90"
                @click="openCreate"
            >
                + Add menu
            </button>
        </header>

        <RevocationBanner v-if="banner != null" :message="banner" />

        <div
            v-if="state.loadError != null"
            class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            role="alert"
        >
            {{ state.loadError }}
        </div>

        <p v-if="state.loading" class="text-sm text-slate-500">Loading…</p>

        <p v-else-if="menusAdminStore.grouped.value.length === 0" class="text-sm text-slate-500">No menus yet.</p>

        <section
            v-for="group in menusAdminStore.grouped.value"
            v-else
            :key="group.label"
            class="rounded-2xl border border-slate-200 bg-white shadow-soft"
        >
            <header class="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <h2 class="text-xs font-semibold uppercase tracking-[0.12em] text-accent">{{ group.label }}</h2>
                <span class="text-xs text-slate-500">{{ group.menus.length }} menu(s)</span>
            </header>
            <ul class="divide-y divide-slate-100">
                <li
                    v-for="menu in group.menus"
                    :key="menu.id"
                    :class="['flex flex-wrap items-center gap-3 px-4 py-3', menu.isActive ? '' : 'opacity-60']"
                >
                    <div class="min-w-[160px] flex-1">
                        <div class="flex items-center gap-2">
                            <span class="font-medium text-ink">{{ menu.label }}</span>
                            <span
                                v-if="!menu.isActive"
                                class="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500"
                            >
                                hidden
                            </span>
                            <span
                                v-if="!isKnownMenuKey(menu.menuKey)"
                                class="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800"
                                title="The frontend has no component registered for this menuKey; sidebar will hide it per AC-7.4."
                            >
                                no frontend
                            </span>
                        </div>
                        <div class="text-xs text-slate-500">
                            <code class="font-mono">{{ menu.menuKey }}</code> · {{ menu.route }}
                        </div>
                    </div>
                    <div class="flex w-40 flex-col text-right text-xs text-slate-500">
                        <span>sort: {{ menu.sortOrder }}</span>
                        <span>{{ menu.permissionCount }} permission(s)</span>
                    </div>
                    <div class="flex gap-3">
                        <button
                            type="button"
                            class="text-xs font-medium text-accent transition hover:underline"
                            @click="openEdit(menu)"
                        >
                            Edit
                        </button>
                        <button
                            type="button"
                            class="text-xs font-medium text-red-600 transition hover:underline"
                            @click="openDelete(menu)"
                        >
                            Delete
                        </button>
                    </div>
                </li>
            </ul>
        </section>

        <!-- Create modal -->
        <div
            v-if="createOpen"
            class="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/40 px-4 py-8"
            role="dialog"
            aria-modal="true"
        >
            <div class="w-full max-w-xl rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-soft">
                <h2 class="text-base font-semibold text-ink">Add menu</h2>
                <p class="mt-1 text-sm text-slate-500">The menu becomes visible to users whose role grants any of its linked permissions. Grant permissions on the next screen by editing this menu.</p>

                <form class="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2" @submit.prevent="submitCreate">
                    <div class="md:col-span-2">
                        <label class="block text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">Menu key</label>
                        <input
                            v-model="createForm.menuKey"
                            type="text"
                            placeholder="e.g. reports-monthly"
                            required
                            class="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                        >
                        <p class="mt-1 text-xs text-slate-500">Immutable after creation. Lowercase letters, digits, and hyphens.</p>
                        <p v-if="createUnknownKeyWarning != null" class="mt-1 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                            {{ createUnknownKeyWarning }}
                        </p>
                    </div>
                    <div>
                        <label class="block text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">Group</label>
                        <select
                            v-if="createGroupMode === 'pick'"
                            :value="createForm.groupLabel"
                            required
                            class="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                            @change="onCreateGroupSelectChange"
                        >
                            <option value="" disabled>Choose a group…</option>
                            <option v-for="g in availableGroups" :key="g" :value="g">{{ g }}</option>
                            <option value="__new__">+ New group…</option>
                        </select>
                        <div v-else class="mt-1 flex gap-2">
                            <input
                                v-model="createForm.groupLabel"
                                type="text"
                                placeholder="e.g. Settlement"
                                required
                                class="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                            >
                            <button
                                type="button"
                                class="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                                @click="cancelCreateNewGroup"
                            >
                                Pick existing
                            </button>
                        </div>
                    </div>
                    <div>
                        <label class="block text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">Label</label>
                        <input
                            v-model="createForm.label"
                            type="text"
                            required
                            class="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                        >
                    </div>
                    <div class="md:col-span-2">
                        <label class="block text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">Route</label>
                        <input
                            v-model="createForm.route"
                            type="text"
                            placeholder="/views/<menu-key>"
                            required
                            class="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                        >
                    </div>
                    <div>
                        <label class="block text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">Sort order</label>
                        <input
                            v-model.number="createForm.sortOrder"
                            type="number"
                            min="0"
                            class="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                        >
                    </div>

                    <div
                        v-if="createForm.error != null"
                        class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 md:col-span-2"
                        role="alert"
                    >
                        {{ createForm.error }}
                    </div>

                    <div class="mt-3 flex justify-end gap-2 md:col-span-2">
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
                            {{ createForm.submitting ? 'Creating…' : 'Create menu' }}
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
                        <h2 class="text-base font-semibold text-ink">Edit menu</h2>
                        <p class="mt-0.5 text-xs text-slate-500">
                            <code class="font-mono">{{ editState.menu?.menuKey }}</code> · immutable after creation
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
                            <label class="block text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">Group</label>
                            <select
                                v-if="editGroupMode === 'pick'"
                                :value="editState.groupLabel"
                                class="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                                @change="onEditGroupSelectChange"
                            >
                                <option value="" disabled>Choose a group…</option>
                                <option v-for="g in availableGroups" :key="g" :value="g">{{ g }}</option>
                                <option value="__new__">+ New group…</option>
                            </select>
                            <div v-else class="mt-1 flex gap-2">
                                <input
                                    v-model="editState.groupLabel"
                                    type="text"
                                    placeholder="e.g. Settlement"
                                    class="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                                >
                                <button
                                    type="button"
                                    class="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                                    @click="cancelEditNewGroup"
                                >
                                    Pick existing
                                </button>
                            </div>
                        </div>
                        <div>
                            <label class="block text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">Label</label>
                            <input
                                v-model="editState.label"
                                type="text"
                                class="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                            >
                        </div>
                        <div class="md:col-span-2">
                            <label class="block text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">Route</label>
                            <input
                                v-model="editState.route"
                                type="text"
                                class="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                            >
                        </div>
                        <div>
                            <label class="block text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">Sort order</label>
                            <input
                                v-model.number="editState.sortOrder"
                                type="number"
                                min="0"
                                class="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                            >
                        </div>
                    </div>
                    <div>
                        <h3 class="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">Permissions that reveal this menu</h3>
                        <p class="mt-1 text-xs text-slate-500">Read-only — menu-to-permission links are controlled by developers via seed data.</p>
                        <p v-if="editState.permsLoadError != null" class="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                            {{ editState.permsLoadError }}
                        </p>
                        <p v-else-if="!editState.permsLoaded" class="mt-2 text-sm text-slate-500">Loading permissions…</p>
                        <p v-else-if="editState.permissionKeys.length === 0" class="mt-2 text-sm text-slate-500">No permissions linked.</p>
                        <ul v-else class="mt-2 flex flex-wrap gap-2">
                            <li
                                v-for="key in editState.permissionKeys"
                                :key="key"
                                class="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700"
                            >
                                <code class="font-mono">{{ key }}</code>
                            </li>
                        </ul>
                    </div>

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
                            :disabled="editState.submitting || !editDirty"
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
            title="Delete menu"
            :message="deleteWarning != null
                ? `${deleteWarning} Permanently delete &quot;${deleteTarget?.label}&quot;?`
                : `Permanently delete &quot;${deleteTarget?.label}&quot;? This cannot be undone.`"
            :confirm-token="deleteTarget?.label"
            :busy="deleteBusy"
            :error-message="deleteError"
            confirm-label="Delete menu"
            tone="danger"
            @confirm="submitDelete"
            @cancel="closeDelete"
        />
    </div>
</template>
