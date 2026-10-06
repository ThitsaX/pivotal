// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.

export type SessionEndReason = 'idle' | 'expired' | 'logout';

export interface SessionPolicy {
    sessionId: string;
    sessionIdleTimeoutMinutes: number;
    sessionExpiresAt: string;
}

export interface SharedSession extends SessionPolicy {
    lastActivityAt: number;
    endedReason?: SessionEndReason;
}

export const SESSION_STORAGE_KEY = 'pivotal.portal.session.v1';

/** Only user input calls recordActivity. Requests and refreshes never move this clock. */
export class SessionActivity {
    private storage: Pick<Storage, 'getItem' | 'setItem'>;
    private now: () => number;

    constructor(storage: Pick<Storage, 'getItem' | 'setItem'>, now: () => number = Date.now) {
        this.storage = storage;
        this.now = now;
    }

    current(): SharedSession | null {
        try {
            const value = JSON.parse(this.storage.getItem(SESSION_STORAGE_KEY) ?? 'null') as SharedSession | null;
            if (value == null || typeof value.sessionId !== 'string'
                || !Number.isFinite(value.lastActivityAt)
                || !Number.isFinite(Date.parse(value.sessionExpiresAt))
                || !Number.isFinite(value.sessionIdleTimeoutMinutes) || value.sessionIdleTimeoutMinutes <= 0) {
                return null;
            }
            return value;
        } catch {
            return null;
        }
    }

    start(policy: SessionPolicy): void {
        this.write({...this.policyFields(policy), lastActivityAt: this.now()});
    }

    expiryReason(session: SharedSession | null = this.current()): SessionEndReason | null {
        if (session == null) return 'expired';
        if (session.endedReason != null) return session.endedReason;
        if (this.now() >= Date.parse(session.sessionExpiresAt)) return 'expired';
        if (this.now() - session.lastActivityAt >= session.sessionIdleTimeoutMinutes * 60_000) return 'idle';
        return null;
    }

    updatePolicy(policy: SessionPolicy): boolean {
        const session = this.current();
        if (session == null || session.sessionId !== policy.sessionId || this.expiryReason(session) != null) return false;
        this.write({...session, ...this.policyFields(policy)});
        return true;
    }

    recordActivity(): void {
        const session = this.current();
        // A wake-up/input after expiry cannot resurrect a session.
        if (session != null && this.expiryReason(session) == null) {
            this.write({...session, lastActivityAt: this.now()});
        }
    }

    end(reason: SessionEndReason): void {
        const session = this.current();
        if (session != null) this.write({...session, endedReason: reason});
    }

    private write(session: SharedSession): void {
        this.storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    }

    private policyFields(policy: SessionPolicy): SessionPolicy {
        // Never persist the access token or user data from a login/refresh response.
        return {
            sessionId: policy.sessionId,
            sessionIdleTimeoutMinutes: policy.sessionIdleTimeoutMinutes,
            sessionExpiresAt: policy.sessionExpiresAt,
        };
    }
}
