import {reactive, readonly} from 'vue';
import {apiClient} from '../api/client';

export type RoleScope = 'HUB' | 'DFSP';

export interface AdminRole {
    id:              string;
    code:            string;
    name:            string;
    description:     string | null;
    scope:           RoleScope;
    isSystem:        boolean;
    userCount:       number;
    permissionCount: number;
}

export interface AdminRoleCreateInput {
    code:         string;
    name:         string;
    scope:        RoleScope;
    description?: string | null;
}

export interface AdminRoleUpdateInput {
    name?:        string;
    description?: string | null;
}

export interface AdminRolePermissionsResponse {
    permissionKeys: string[];
}

interface RolesAdminState {
    items:           AdminRole[];
    loading:         boolean;
    loadError:       string | null;
    /** roleId → permissionKeys[]. Populated on demand by loadPermissions(roleId). */
    permissionsByRole: Record<string, string[]>;
}

const state = reactive<RolesAdminState>({
    items:             [],
    loading:           false,
    loadError:         null,
    permissionsByRole: {},
});

function describeError(error: unknown): string {
    if (error instanceof Error && error.message.length > 0) {
        return error.message;
    }
    return 'Request failed.';
}

export const rolesAdminStore = {

    state: readonly(state),

    async loadRoles(): Promise<void> {

        state.loading = true;
        state.loadError = null;

        try {
            state.items = await apiClient.get<AdminRole[]>('/admin/roles');
        } catch (error) {
            state.loadError = describeError(error);
            state.items = [];
        } finally {
            state.loading = false;
        }
    },

    async loadPermissions(roleId: string): Promise<string[]> {

        const response = await apiClient.get<AdminRolePermissionsResponse>(`/admin/roles/${roleId}/permissions`);
        state.permissionsByRole[roleId] = response.permissionKeys;
        return response.permissionKeys;
    },

    async createRole(input: AdminRoleCreateInput): Promise<AdminRole> {

        const role = await apiClient.post<AdminRole>('/admin/roles', input);
        state.items = [...state.items, role];
        return role;
    },

    async updateRole(id: string, input: AdminRoleUpdateInput): Promise<AdminRole> {

        const role = await apiClient.patch<AdminRole>(`/admin/roles/${id}`, input);
        const index = state.items.findIndex((r) => r.id === id);
        if (index >= 0) {
            state.items[index] = role;
        }
        return role;
    },

    async deleteRole(id: string): Promise<void> {

        await apiClient.delete<void>(`/admin/roles/${id}`);
        state.items = state.items.filter((r) => r.id !== id);
        delete state.permissionsByRole[id];
    },

    async replacePermissions(roleId: string, permissionKeys: string[]): Promise<string[]> {

        const response = await apiClient.put<AdminRolePermissionsResponse>(
            `/admin/roles/${roleId}/permissions`,
            {permissionKeys},
        );
        state.permissionsByRole[roleId] = response.permissionKeys;
        // Update the role's permission count in place.
        const index = state.items.findIndex((r) => r.id === roleId);
        if (index >= 0) {
            state.items[index] = {...state.items[index], permissionCount: response.permissionKeys.length};
        }
        return response.permissionKeys;
    },

    reset(): void {
        state.items = [];
        state.loading = false;
        state.loadError = null;
        state.permissionsByRole = {};
    },
};
