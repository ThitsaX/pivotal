import {reactive, readonly} from 'vue';
import {apiClient} from '../api/client';

export type RoleScope = 'HUB' | 'DFSP';

export interface AdminRoleSummary {
    id:    string;
    code:  string;
    name:  string;
    scope: RoleScope;
}

export interface AdminUser {
    id:                 string;
    email:              string;
    role:               AdminRoleSummary;
    fspId:              string | null;
    isActive:           boolean;
    mustChangePassword: boolean;
    lastLoginAt:        string | null;
    createdAt:          string;
}

export interface AdminUserListResponse {
    items:    AdminUser[];
    page:     number;
    pageSize: number;
    total:    number;
}

export interface AdminUserWithTempPassword {
    user:         AdminUser;
    tempPassword: string;
}

export interface AdminUserCreateInput {
    email:  string;
    roleId: string;
    fspId?: string | null;
}

export interface AdminUserUpdateInput {
    roleId?:   string;
    fspId?:    string | null;
    isActive?: boolean;
}

export interface UsersAdminFilters {
    roleId?:  string;
    fspId?:   string;
    isActive?: boolean;
    search?:  string;
}

interface UsersAdminState {
    items:     AdminUser[];
    total:     number;
    page:      number;
    pageSize:  number;
    filters:   UsersAdminFilters;
    loading:   boolean;
    loadError: string | null;
    roles:     AdminRoleSummary[];
    rolesLoaded: boolean;
    rolesError: string | null;
}

const DEFAULT_PAGE_SIZE = 25;

const state = reactive<UsersAdminState>({
    items:       [],
    total:       0,
    page:        1,
    pageSize:    DEFAULT_PAGE_SIZE,
    filters:     {},
    loading:     false,
    loadError:   null,
    roles:       [],
    rolesLoaded: false,
    rolesError:  null,
});

function buildQueryString(): string {
    const params = new URLSearchParams();
    params.set('page', String(state.page));
    params.set('pageSize', String(state.pageSize));

    if (state.filters.roleId != null && state.filters.roleId.length > 0) {
        params.set('roleId', state.filters.roleId);
    }
    if (state.filters.fspId != null && state.filters.fspId.length > 0) {
        params.set('fspId', state.filters.fspId);
    }
    if (state.filters.isActive != null) {
        params.set('isActive', String(state.filters.isActive));
    }
    if (state.filters.search != null && state.filters.search.length > 0) {
        params.set('search', state.filters.search);
    }

    return params.toString();
}

function describeError(error: unknown): string {
    if (error instanceof Error && error.message.length > 0) {
        return error.message;
    }
    return 'Request failed.';
}

export const usersAdminStore = {

    state: readonly(state),

    async loadUsers(): Promise<void> {

        state.loading = true;
        state.loadError = null;

        try {
            const response = await apiClient.get<AdminUserListResponse>(`/admin/users?${buildQueryString()}`);
            state.items = response.items;
            state.total = response.total;
            state.page = response.page;
            state.pageSize = response.pageSize;
        } catch (error) {
            state.loadError = describeError(error);
            state.items = [];
            state.total = 0;
        } finally {
            state.loading = false;
        }
    },

    async loadRoles(): Promise<void> {

        // Always refetch — admins commonly create roles elsewhere, then come here
        // to assign them. A cached list would serve stale rows on the second visit.
        state.rolesError = null;

        try {
            const roles = await apiClient.get<Array<AdminRoleSummary & {description?: string | null; isSystem: boolean}>>(
                '/admin/roles',
            );
            state.roles = roles.map((r) => ({id: r.id, code: r.code, name: r.name, scope: r.scope}));
            state.rolesLoaded = true;
        } catch (error) {
            state.rolesError = describeError(error);
            state.rolesLoaded = false;
        }
    },

    async createUser(input: AdminUserCreateInput): Promise<AdminUserWithTempPassword> {

        const created = await apiClient.post<AdminUserWithTempPassword>('/admin/users', input);

        await usersAdminStore.loadUsers();

        return created;
    },

    async updateUser(id: string, input: AdminUserUpdateInput): Promise<AdminUser> {

        const updated = await apiClient.patch<AdminUser>(`/admin/users/${id}`, input);

        // Refresh the row in place so the table reflects the new role/status without a full reload.
        const index = state.items.findIndex((u) => u.id === id);
        if (index >= 0) {
            state.items[index] = updated;
        }

        return updated;
    },

    async resetPassword(id: string): Promise<AdminUserWithTempPassword> {

        const response = await apiClient.post<AdminUserWithTempPassword>(`/admin/users/${id}/reset-password`);

        const index = state.items.findIndex((u) => u.id === id);
        if (index >= 0) {
            state.items[index] = response.user;
        }

        return response;
    },

    async deactivateUser(id: string): Promise<AdminUser> {

        const updated = await apiClient.delete<AdminUser>(`/admin/users/${id}`);

        const index = state.items.findIndex((u) => u.id === id);
        if (index >= 0) {
            state.items[index] = updated;
        }

        return updated;
    },

    setFilters(filters: Partial<UsersAdminFilters>): void {
        state.filters = {...state.filters, ...filters};
        state.page = 1;
    },

    clearFilters(): void {
        state.filters = {};
        state.page = 1;
    },

    setPage(page: number): void {
        if (page < 1) {
            state.page = 1;
            return;
        }
        state.page = page;
    },

    setPageSize(pageSize: number): void {
        if (pageSize < 1 || pageSize > 200) {
            return;
        }
        state.pageSize = pageSize;
        state.page = 1;
    },

    reset(): void {
        state.items = [];
        state.total = 0;
        state.page = 1;
        state.pageSize = DEFAULT_PAGE_SIZE;
        state.filters = {};
        state.loading = false;
        state.loadError = null;
        state.roles = [];
        state.rolesLoaded = false;
        state.rolesError = null;
    },
};
