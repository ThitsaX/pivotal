import { computed, reactive, readonly } from 'vue';
import { apiClient, ApiError, registerRefreshHandler, registerSessionExpiredHandler, setAccessToken, } from '../api/client';
import { clearMenuStore, loadMenuStore } from './menu.store';
const state = reactive({
    user: null,
    permissions: [],
    mustChangePassword: false,
    isAuthenticated: false,
    bootstrapping: true,
});
let sessionExpiredCallback = null;
function applyLogin(response) {
    setAccessToken(response.accessToken);
    state.user = response.user;
    state.permissions = response.permissions;
    state.mustChangePassword = response.mustChangePassword;
    state.isAuthenticated = true;
}
function applyRefresh(response) {
    setAccessToken(response.accessToken);
    state.permissions = response.permissions;
    state.mustChangePassword = response.mustChangePassword;
    state.isAuthenticated = true;
}
function clearState() {
    setAccessToken(null);
    state.user = null;
    state.permissions = [];
    state.mustChangePassword = false;
    state.isAuthenticated = false;
    clearMenuStore();
}
registerRefreshHandler(async () => {
    try {
        const response = await apiClient.postWithoutAuthRetry('/auth/refresh');
        applyRefresh(response);
        return true;
    }
    catch {
        clearState();
        return false;
    }
});
registerSessionExpiredHandler(() => {
    clearState();
    sessionExpiredCallback?.();
});
export const authStore = {
    state: readonly(state),
    isAuthenticated: computed(() => state.isAuthenticated),
    isBootstrapping: computed(() => state.bootstrapping),
    needsPasswordChange: computed(() => state.isAuthenticated && state.mustChangePassword),
    hasPermission(key) {
        return state.permissions.includes(key);
    },
    onSessionExpired(callback) {
        sessionExpiredCallback = callback;
    },
    async login(email, password) {
        const response = await apiClient.post('/auth/login', { email, password });
        applyLogin(response);
        await loadMenuStore();
    },
    async logout() {
        try {
            await apiClient.post('/auth/logout');
        }
        catch {
            // Best-effort: even if the server call fails, drop local state.
        }
        clearState();
    },
    async changePassword(currentPassword, newPassword) {
        await apiClient.post('/auth/change-password', { currentPassword, newPassword });
        state.mustChangePassword = false;
    },
    async bootstrap() {
        state.bootstrapping = true;
        try {
            const refreshed = await apiClient.postWithoutAuthRetry('/auth/refresh');
            applyRefresh(refreshed);
            const me = await apiClient.get('/auth/me');
            state.user = {
                id: me.user.id,
                email: me.user.email,
                role: me.user.role,
                fspId: me.user.fspId,
            };
            state.permissions = me.permissions;
            state.mustChangePassword = me.user.mustChangePassword;
            await loadMenuStore();
        }
        catch (error) {
            if (error instanceof ApiError && error.status !== 401) {
                console.error('[auth] bootstrap failed', error);
            }
            clearState();
        }
        finally {
            state.bootstrapping = false;
        }
    },
};
