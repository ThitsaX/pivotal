// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {computed, reactive, readonly} from 'vue';
import {
    apiClient,
    ApiError,
    registerRefreshHandler,
    registerSessionExpiredHandler,
    setAccessToken,
} from '../api/client';
import {clearMenuStore, loadMenuStore} from './menu.store';
import {usersAdminStore} from './users-admin.store';

export interface AuthUser {
    id: string;
    email: string;
    role: string;
    fspId: string | null;
}

export interface LoginResponse {
    accessToken: string;
    accessTokenExpiresIn: number;
    user: AuthUser;
    permissions: string[];
    mustChangePassword: boolean;
}

export interface RefreshResponse {
    accessToken: string;
    accessTokenExpiresIn: number;
    permissions: string[];
    mustChangePassword: boolean;
}

interface MeResponse {
    user: AuthUser;
    permissions: string[];
    mustChangePassword: boolean;
}

interface AuthState {
    user: AuthUser | null;
    permissions: string[];
    mustChangePassword: boolean;
    isAuthenticated: boolean;
    bootstrapping: boolean;
}

const state = reactive<AuthState>({
    user: null,
    permissions: [],
    mustChangePassword: false,
    isAuthenticated: false,
    bootstrapping: true,
});

let sessionExpiredCallback: (() => void) | null = null;

function applyLogin(response: LoginResponse): void {
    setAccessToken(response.accessToken);
    state.user = response.user;
    state.permissions = response.permissions;
    state.mustChangePassword = response.mustChangePassword;
    state.isAuthenticated = true;
}

function applyRefresh(response: RefreshResponse): void {
    setAccessToken(response.accessToken);
    state.permissions = response.permissions;
    state.mustChangePassword = response.mustChangePassword;
    state.isAuthenticated = true;
}

function clearState(): void {
    setAccessToken(null);
    state.user = null;
    state.permissions = [];
    state.mustChangePassword = false;
    state.isAuthenticated = false;
    clearMenuStore();
    usersAdminStore.reset();
}

registerRefreshHandler(async (): Promise<boolean> => {

    try {
        const response = await apiClient.postWithoutAuthRetry<RefreshResponse>('/auth/refresh');

        applyRefresh(response);

        return true;
    } catch {
        clearState();

        return false;
    }
});

registerSessionExpiredHandler((): void => {
    clearState();
    sessionExpiredCallback?.();
});

export const authStore = {

    state: readonly(state),

    isAuthenticated: computed((): boolean => state.isAuthenticated),

    isBootstrapping: computed((): boolean => state.bootstrapping),

    needsPasswordChange: computed((): boolean => state.isAuthenticated && state.mustChangePassword),

    hasPermission(key: string): boolean {
        return state.permissions.includes(key);
    },

    onSessionExpired(callback: () => void): void {
        sessionExpiredCallback = callback;
    },

    async login(email: string, password: string): Promise<void> {
        const response = await apiClient.post<LoginResponse>('/auth/login', {email, password});

        applyLogin(response);
        await loadMenuStore();
    },

    async logout(): Promise<void> {

        try {
            await apiClient.post<void>('/auth/logout');
        } catch {
            // Best-effort: even if the server call fails, drop local state.
        }

        clearState();
    },

    async changePassword(currentPassword: string, newPassword: string): Promise<void> {
        await apiClient.post<void>('/auth/change-password', {currentPassword, newPassword});

        clearState();
    },

    async bootstrap(): Promise<void> {

        state.bootstrapping = true;

        try {
            const refreshed = await apiClient.postWithoutAuthRetry<RefreshResponse>('/auth/refresh');

            applyRefresh(refreshed);

            const me = await apiClient.get<MeResponse>('/auth/me');

            state.user = {
                id: me.user.id,
                email: me.user.email,
                role: me.user.role,
                fspId: me.user.fspId,
            };
            state.permissions = me.permissions;
            state.mustChangePassword = me.mustChangePassword;

            await loadMenuStore();
        } catch (error) {
            if (error instanceof ApiError && error.status !== 401) {
                console.error('[auth] bootstrap failed', error);
            }

            clearState();
        } finally {
            state.bootstrapping = false;
        }
    },
};
