import assert from 'node:assert/strict';
import {test} from 'node:test';
import {SessionActivity, SESSION_STORAGE_KEY} from '../src/stores/session-activity.ts';

const MINUTE = 60_000;
function fixture() {
    let now = Date.parse('2026-10-01T00:00:00Z');
    const values = new Map<string, string>();
    const storage = {getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }};
    const activeTab = new SessionActivity(storage, () => now);
    const idleTab = new SessionActivity(storage, () => now);
    const policy = {sessionId: '1', sessionIdleTimeoutMinutes: 30, sessionExpiresAt: new Date(now + 12 * 60 * MINUTE).toISOString()};
    activeTab.start(policy);
    return {activeTab, idleTab, policy, storage, tick: (ms: number) => {now += ms;}};
}

test('no input expires at 30 minutes; refresh and dashboard traffic do not count as activity', () => {
    const f = fixture();
    for (let minute = 0; minute < 29; minute++) {
        f.tick(MINUTE);
        assert.equal(f.activeTab.updatePolicy(f.policy), true);
        assert.equal(f.activeTab.expiryReason(), null);
    }
    f.tick(MINUTE);
    assert.equal(f.activeTab.expiryReason(), 'idle');
    assert.equal(f.activeTab.updatePolicy(f.policy), false);
});

test('input in one tab keeps both tabs alive until the fixed absolute deadline', () => {
    const f = fixture();
    for (let minute = 1; minute < 720; minute++) {
        f.tick(MINUTE);
        f.activeTab.recordActivity();
        assert.equal(f.idleTab.expiryReason(), null);
    }
    f.tick(MINUTE);
    f.activeTab.recordActivity();
    assert.equal(f.activeTab.expiryReason(), 'expired');
    assert.equal(f.idleTab.expiryReason(), 'expired');
});

test('reopening after 30 minutes or input after wake cannot revive an idle session', () => {
    const f = fixture();
    f.tick(31 * MINUTE);
    f.idleTab.recordActivity();
    assert.equal(f.idleTab.expiryReason(), 'idle');
    assert.equal(f.activeTab.expiryReason(), 'idle');
});

test('custom idle policy changes the boundary', () => {
    const f = fixture();
    f.activeTab.updatePolicy({...f.policy, sessionIdleTimeoutMinutes: 45});
    f.tick(30 * MINUTE);
    assert.equal(f.idleTab.expiryReason(), null);
    f.tick(15 * MINUTE);
    assert.equal(f.idleTab.expiryReason(), 'idle');
});

test('logout propagates and an old refresh response cannot revive the ended session', () => {
    const f = fixture();
    f.activeTab.end('logout');
    assert.equal(f.idleTab.expiryReason(), 'logout');
    assert.equal(f.idleTab.updatePolicy(f.policy), false);
});

test('never stores tokens or user information from login/refresh responses', () => {
    const f = fixture();
    const response = {...f.policy, accessToken: 'secret-token', user: {email: 'private@example.com'}};
    f.activeTab.start(response);
    f.activeTab.updatePolicy(response);
    const stored = JSON.parse(f.storage.getItem(SESSION_STORAGE_KEY)!);
    assert.deepEqual(Object.keys(stored).sort(), ['lastActivityAt', 'sessionExpiresAt', 'sessionId', 'sessionIdleTimeoutMinutes'].sort());
});

test('a delayed old-session result cannot overwrite a newer sign-in', () => {
    const f = fixture();
    f.idleTab.start({...f.policy, sessionId: '2'});
    assert.equal(f.activeTab.updatePolicy(f.policy), false);
    assert.equal(f.activeTab.current()?.sessionId, '2');
});
