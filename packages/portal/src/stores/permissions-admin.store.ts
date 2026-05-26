import {computed, reactive, readonly} from 'vue';
import {apiClient} from '../api/client';

export type PermissionScope = 'HUB' | 'DFSP' | 'BOTH';

export interface AdminPermission {
    id:          string;
    keyName:     string;
    description: string | null;
    scope:       PermissionScope;
}

interface PermissionListResponse {
    items: AdminPermission[];
}

interface PermissionsAdminState {
    items:     AdminPermission[];
    loaded:    boolean;
    loading:   boolean;
    loadError: string | null;
}

const state = reactive<PermissionsAdminState>({
    items:     [],
    loaded:    false,
    loading:   false,
    loadError: null,
});

function describeError(error: unknown): string {
    if (error instanceof Error && error.message.length > 0) {
        return error.message;
    }
    return 'Request failed.';
}

export function namespaceOf(keyName: string): string {
    const dot = keyName.indexOf('.');
    return dot < 0 ? keyName : keyName.slice(0, dot);
}

export function namespaceLabel(ns: string): string {
    if (ns.length === 0) return 'Other';
    return ns.charAt(0).toUpperCase() + ns.slice(1);
}

export const permissionsAdminStore = {

    state: readonly(state),

    /** Permissions grouped by namespace (first dot segment). Stable, alphabetical group order. */
    groupedByNamespace: computed((): Array<{namespace: string; label: string; items: AdminPermission[]}> => {
        const byNs = new Map<string, AdminPermission[]>();
        for (const perm of state.items) {
            const ns = namespaceOf(perm.keyName);
            const bucket = byNs.get(ns);
            if (bucket == null) {
                byNs.set(ns, [perm]);
            } else {
                bucket.push(perm);
            }
        }
        const groups: Array<{namespace: string; label: string; items: AdminPermission[]}> = [];
        for (const [ns, items] of byNs.entries()) {
            groups.push({namespace: ns, label: namespaceLabel(ns), items: items.slice().sort((a, b) => a.keyName.localeCompare(b.keyName))});
        }
        groups.sort((a, b) => a.namespace.localeCompare(b.namespace));
        return groups;
    }),

    async load(force: boolean = false): Promise<void> {

        if (state.loaded && !force) {
            return;
        }

        state.loading = true;
        state.loadError = null;

        try {
            const response = await apiClient.get<PermissionListResponse>('/admin/permissions');
            state.items = response.items;
            state.loaded = true;
        } catch (error) {
            state.loadError = describeError(error);
            state.items = [];
            state.loaded = false;
        } finally {
            state.loading = false;
        }
    },

    reset(): void {
        state.items = [];
        state.loaded = false;
        state.loading = false;
        state.loadError = null;
    },
};
