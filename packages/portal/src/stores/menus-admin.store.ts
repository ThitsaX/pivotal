import {computed, reactive, readonly} from 'vue';
import {apiClient} from '../api/client';

export interface AdminMenu {
    id:              string;
    menuKey:         string;
    parentId:        string | null;
    groupLabel:      string;
    label:           string;
    route:           string;
    icon:            string | null;
    sortOrder:       number;
    isActive:        boolean;
    permissionCount: number;
}

export interface AdminMenuCreateInput {
    menuKey:    string;
    groupLabel: string;
    label:      string;
    route:      string;
    icon?:      string | null;
    sortOrder?: number;
    parentId?:  string | null;
}

export interface AdminMenuUpdateInput {
    groupLabel?: string;
    label?:      string;
    route?:      string;
    icon?:       string | null;
    sortOrder?:  number;
    parentId?:   string | null;
    isActive?:   boolean;
}

export interface AdminMenuPermissionsResponse {
    permissionKeys: string[];
}

export interface AdminMenuGroup {
    label: string;
    menus: AdminMenu[];
}

interface MenusAdminState {
    items:             AdminMenu[];
    loading:           boolean;
    loadError:         string | null;
    /** menuId → permissionKeys[]. Populated on demand by loadPermissions(menuId). */
    permissionsByMenu: Record<string, string[]>;
}

const state = reactive<MenusAdminState>({
    items:             [],
    loading:           false,
    loadError:         null,
    permissionsByMenu: {},
});

function describeError(error: unknown): string {
    if (error instanceof Error && error.message.length > 0) {
        return error.message;
    }
    return 'Request failed.';
}

export const menusAdminStore = {

    state: readonly(state),

    /** Menus grouped by group_label, ordered by sort_order inside each group. Inactive menus are kept. */
    grouped: computed((): AdminMenuGroup[] => {
        const byLabel = new Map<string, AdminMenu[]>();
        for (const menu of state.items) {
            const bucket = byLabel.get(menu.groupLabel);
            if (bucket == null) {
                byLabel.set(menu.groupLabel, [menu]);
            } else {
                bucket.push(menu);
            }
        }
        const groups: AdminMenuGroup[] = [];
        for (const [label, menus] of byLabel.entries()) {
            menus.sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
            groups.push({label, menus});
        }
        groups.sort((a, b) => a.label.localeCompare(b.label));
        return groups;
    }),

    async loadMenus(): Promise<void> {

        state.loading = true;
        state.loadError = null;

        try {
            state.items = await apiClient.get<AdminMenu[]>('/admin/menus');
        } catch (error) {
            state.loadError = describeError(error);
            state.items = [];
        } finally {
            state.loading = false;
        }
    },

    async loadPermissions(menuId: string): Promise<string[]> {

        const response = await apiClient.get<AdminMenuPermissionsResponse>(`/admin/menus/${menuId}/permissions`);
        state.permissionsByMenu[menuId] = response.permissionKeys;
        return response.permissionKeys;
    },

    async createMenu(input: AdminMenuCreateInput): Promise<AdminMenu> {

        const menu = await apiClient.post<AdminMenu>('/admin/menus', input);
        state.items = [...state.items, menu];
        return menu;
    },

    async updateMenu(id: string, input: AdminMenuUpdateInput): Promise<AdminMenu> {

        const menu = await apiClient.patch<AdminMenu>(`/admin/menus/${id}`, input);
        const index = state.items.findIndex((m) => m.id === id);
        if (index >= 0) {
            state.items[index] = menu;
        }
        return menu;
    },

    async deleteMenu(id: string): Promise<void> {

        await apiClient.delete<void>(`/admin/menus/${id}`);
        state.items = state.items.filter((m) => m.id !== id);
        delete state.permissionsByMenu[id];
    },

    reset(): void {
        state.items = [];
        state.loading = false;
        state.loadError = null;
        state.permissionsByMenu = {};
    },
};
