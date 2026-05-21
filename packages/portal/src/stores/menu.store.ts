import {reactive, readonly} from 'vue';
import {apiClient} from '../api/client';

export interface MenuItem {
    key: string;
    label: string;
    route: string;
    icon: string | null;
    sortOrder: number;
}

export interface MenuGroup {
    label: string;
    menus: MenuItem[];
}

interface MenuResponse {
    groups: MenuGroup[];
}

interface MenuState {
    groups: MenuGroup[];
    loaded: boolean;
}

const state = reactive<MenuState>({
    groups: [],
    loaded: false,
});

export const menuStore = {
    state: readonly(state),
};

export async function loadMenuStore(): Promise<void> {
    const response = await apiClient.get<MenuResponse>('/auth/me/menu');

    state.groups = response.groups;
    state.loaded = true;
}

export function clearMenuStore(): void {
    state.groups = [];
    state.loaded = false;
}
