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
import {SessionActivity, SESSION_STORAGE_KEY, type SessionEndReason, type SessionPolicy} from './session-activity';

export interface AuthUser {
    id: string;
    email: string;
    role: string;
    fspId: string | null;
}

export interface LoginResponse extends SessionPolicy {
    accessToken: string;
    accessTokenExpiresIn: number;
    user: AuthUser;
    permissions: string[];
    mustChangePassword: boolean;
}

export interface RefreshResponse extends SessionPolicy {
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

let sessionExpiredCallback: ((reason: SessionEndReason) => void) | null = null;
const activity = new SessionActivity(window.localStorage);
let activeSessionId: string | null = null;
let refreshAt = Infinity;
let refreshPromise: Promise<boolean> | null = null;
let expiryPromise: Promise<void> | null = null;
let endReason: SessionEndReason | null = null;

// The cookie is shared across tabs. Serialize rotation/logout/login to avoid token reuse races.
async function withAuthLock<T>(operation: () => Promise<T>): Promise<T> {
    if (navigator.locks == null) {
        return Promise.reject(new Error('Signing in requires a browser with Web Locks support and HTTPS (or localhost).'));
    }
    return await navigator.locks.request('pivotal.portal.auth', operation);
}

function scheduleRefresh(response: LoginResponse | RefreshResponse): void {
    refreshAt = Date.now() + Math.max(1000, (response.accessTokenExpiresIn - Math.min(60, response.accessTokenExpiresIn / 2)) * 1000);
    activeSessionId = response.sessionId;
    endReason = null;
}

function applyLogin(response: LoginResponse): void {
    activity.start(response);
    scheduleRefresh(response);
    setAccessToken(response.accessToken);
    state.user = response.user;
    state.permissions = response.permissions;
    state.mustChangePassword = response.mustChangePassword;
    state.isAuthenticated = true;
}

function applyRefresh(response: RefreshResponse): void {
    scheduleRefresh(response);
    setAccessToken(response.accessToken);
    state.permissions = response.permissions;
    state.mustChangePassword = response.mustChangePassword;
    state.isAuthenticated = true;
}

function clearState(): void {
    activeSessionId = null;
    refreshAt = Infinity;
    setAccessToken(null);
    state.user = null;
    state.permissions = [];
    state.mustChangePassword = false;
    state.isAuthenticated = false;
    clearMenuStore();
    usersAdminStore.reset();
}

function clearEndedSession(reason: SessionEndReason): void {
    endReason = reason;
    clearState();
    sessionExpiredCallback?.(reason);
}

async function revokeSession(reason: SessionEndReason): Promise<void> {
    activity.end(reason);
    clearEndedSession(reason);
    try {
        await apiClient.postWithoutAuthRetry<void>('/auth/logout');
    } catch {
        // A persisted ended marker prevents reopening/refreshing even if offline.
    }
}

function checkSession(): Promise<void> {
    if (expiryPromise != null) return expiryPromise;
    expiryPromise = withAuthLock(async () => {
        const session = activity.current();
        // Re-read inside the lock: another tab may have recorded input while we waited.
        const reason = activity.expiryReason(session);
        if (reason == null) return;
        if (session?.endedReason != null) {
            clearEndedSession(reason);
        } else {
            await revokeSession(reason);
        }
    }).finally(() => { expiryPromise = null; });
    return expiryPromise;
}

function refreshSession(): Promise<boolean> {
    if (refreshPromise != null) return refreshPromise;
    refreshPromise = withAuthLock(async () => {
        const session = activity.current();
        if (session == null) {
            // Includes an upgrade from a portal that did not persist session deadlines.
            try { await apiClient.postWithoutAuthRetry<void>('/auth/logout'); } catch { /* best effort */ }
            clearState();
            return false;
        }
        const reason = activity.expiryReason(session);
        if (reason != null) {
            if (session?.endedReason != null) clearEndedSession(reason);
            else await revokeSession(reason);
            return false;
        }
        try {
            const response = await apiClient.postWithoutAuthRetry<RefreshResponse>('/auth/refresh');
            if (!activity.updatePolicy(response)) {
                await revokeSession(activity.expiryReason() ?? 'expired');
                return false;
            }
            applyRefresh(response);
            return true;
        } catch (error) {
            if (error instanceof ApiError && error.status === 401) {
                const serverReason = (error.body as {reason?: string} | null)?.reason;
                activity.end(serverReason === 'idle' ? 'idle' : 'expired');
                clearEndedSession(serverReason === 'idle' ? 'idle' : 'expired');
            } else {
                // A temporary network/server error does not imply the session expired.
                refreshAt = Date.now() + 5000;
            }
            return false;
        }
    }).finally(() => { refreshPromise = null; });
    return refreshPromise;
}

registerRefreshHandler(refreshSession);

registerSessionExpiredHandler((): void => {
    if (endReason != null) sessionExpiredCallback?.(endReason);
});

function monitorSession(): void {
    if (!state.isAuthenticated) return;
    const session = activity.current();
    if (activity.expiryReason(session) != null) {
        void checkSession().catch(console.error);
    } else if (session?.sessionId !== activeSessionId) {
        // Another tab signed in as a new session; do not continue with the old user's token.
        clearState();
        void authStore.bootstrap();
    } else if (Date.now() >= refreshAt) {
        void refreshSession().catch(console.error);
    }
}

for (const type of ['keydown', 'pointerdown', 'pointermove', 'mousedown', 'mousemove', 'touchstart', 'touchmove', 'wheel']) {
    window.addEventListener(type, (event: Event) => {
        if (event.isTrusted && state.isAuthenticated) activity.recordActivity();
        monitorSession();
    }, {passive: true});
}
window.addEventListener('storage', (event) => {
    if (event.key === SESSION_STORAGE_KEY || event.key == null) monitorSession();
});
window.addEventListener('focus', monitorSession);
window.addEventListener('pageshow', monitorSession);
document.addEventListener('visibilitychange', monitorSession);
window.setInterval(monitorSession, 1000);

export const authStore = {

    state: readonly(state),

    isAuthenticated: computed((): boolean => state.isAuthenticated),

    isBootstrapping: computed((): boolean => state.bootstrapping),

    needsPasswordChange: computed((): boolean => state.isAuthenticated && state.mustChangePassword),

    hasPermission(key: string): boolean {
        return state.permissions.includes(key);
    },

    get sessionEndReason(): SessionEndReason | null { return endReason; },

    onSessionExpired(callback: (reason: SessionEndReason) => void): void {
        sessionExpiredCallback = callback;
    },

    async login(email: string, password: string): Promise<void> {
        await withAuthLock(async () => {
            const response = await apiClient.postWithoutAuthRetry<LoginResponse>('/auth/login', {email, password});
            applyLogin(response);
        });
        await loadMenuStore();
    },

    async logout(): Promise<void> {

        await withAuthLock(() => revokeSession('logout'));
    },

    async changePassword(currentPassword: string, newPassword: string): Promise<void> {
        await withAuthLock(async () => {
            await apiClient.postWithoutAuthRetry<void>('/auth/change-password', {currentPassword, newPassword});
            activity.end('logout');
            clearState();
        });
    },

    async bootstrap(): Promise<void> {

        state.bootstrapping = true;

        try {
            if (!await refreshSession()) return;

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
