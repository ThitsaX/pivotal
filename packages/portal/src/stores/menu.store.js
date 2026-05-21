import { reactive, readonly } from 'vue';
import { apiClient } from '../api/client';
const state = reactive({
    groups: [],
    loaded: false,
});
export const menuStore = {
    state: readonly(state),
};
export async function loadMenuStore() {
    const response = await apiClient.get('/auth/me/menu');
    state.groups = response.groups;
    state.loaded = true;
}
export function clearMenuStore() {
    state.groups = [];
    state.loaded = false;
}
