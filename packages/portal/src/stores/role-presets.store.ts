import {reactive, readonly} from 'vue';
import {apiClient} from '../api/client';
import type {RoleScope} from './roles-admin.store';

export interface RolePreset {
    key:            string;
    label:          string;
    description:    string;
    scope:          RoleScope;
    permissionKeys: string[];
}

interface RolePresetsState {
    items:     RolePreset[];
    loaded:    boolean;
    loading:   boolean;
    loadError: string | null;
}

const state = reactive<RolePresetsState>({
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

export const rolePresetsStore = {

    state: readonly(state),

    async load(force: boolean = false): Promise<void> {

        if (state.loaded && !force) {
            return;
        }

        state.loading = true;
        state.loadError = null;

        try {
            state.items = await apiClient.get<RolePreset[]>('/admin/role-presets');
            state.loaded = true;
        } catch (error) {
            state.loadError = describeError(error);
            state.items = [];
            state.loaded = false;
        } finally {
            state.loading = false;
        }
    },

    forScope(scope: RoleScope): RolePreset[] {
        return state.items.filter((p) => p.scope === scope);
    },

    reset(): void {
        state.items = [];
        state.loaded = false;
        state.loading = false;
        state.loadError = null;
    },
};
