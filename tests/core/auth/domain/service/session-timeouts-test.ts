import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {JwtService} from '@nestjs/jwt';
import {ConfigService} from '@nestjs/config';
import {WebPivotalSettings} from '../../../../../packages/apps/web-pivotal/required.settings';
import {TokenService} from '../../../../../packages/core/auth/domain/service/token.service';

const NOW = Date.parse('2026-10-01T00:00:00Z');
const MINUTE = 60_000;

describe('session token lifetimes', () => {
    const settings = new WebPivotalSettings(new ConfigService({PIVOTAL_IAM_JWT_SECRET: 'unit-test-only'}));
    const jwt = new JwtService({signOptions: {issuer: 'pivotal'}});
    const service = new TokenService(jwt, settings);

    it('sets a 30-minute idle expiry and a 12-hour deadline on login', (t) => {
        t.mock.timers.enable({apis: ['Date'], now: NOW});
        const issued = service.issueRefreshToken();
        assert.equal(issued.expiresAt.getTime(), NOW + 30 * MINUTE);
        assert.equal(issued.sessionExpiresAt.getTime(), NOW + 12 * 60 * MINUTE);
        assert.equal(issued.hash, TokenService.hashRefreshToken(issued.plaintext));
    });

    it('carries the original deadline through repeated rotation and caps idle expiry', (t) => {
        t.mock.timers.enable({apis: ['Date'], now: NOW});
        const first = service.issueRefreshToken();
        t.mock.timers.tick(20 * MINUTE);
        const second = service.issueRefreshToken(first.sessionExpiresAt);
        assert.equal(second.expiresAt.getTime(), NOW + 50 * MINUTE);
        assert.equal(second.sessionExpiresAt.getTime(), first.sessionExpiresAt.getTime());
        assert.notEqual(first.hash, second.hash);
        t.mock.timers.tick(11 * 60 * MINUTE + 20 * MINUTE);
        const last = service.issueRefreshToken(second.sessionExpiresAt);
        assert.equal(last.expiresAt.getTime(), first.sessionExpiresAt.getTime());
        assert.equal(last.sessionExpiresAt.getTime(), first.sessionExpiresAt.getTime());
    });

    it('does not issue an access token beyond the absolute session deadline', async (t) => {
        t.mock.timers.enable({apis: ['Date'], now: NOW});
        const access = await service.signAccessToken({
            userId: '1', roleCode: 'ADMIN', fspId: null, permissions: [], mustChangePassword: false,
            sessionExpiresAt: new Date(NOW + 5 * MINUTE),
        });
        assert.equal(jwt.decode(access).exp, (NOW + 5 * MINUTE) / 1000);
    });

    it('uses configured idle and absolute limits', (t) => {
        t.mock.timers.enable({apis: ['Date'], now: NOW});
        const configured = new WebPivotalSettings(new ConfigService({
            PIVOTAL_IAM_SESSION_IDLE_TIMEOUT_MINUTES: '45',
            PIVOTAL_IAM_SESSION_ABSOLUTE_TIMEOUT_HOURS: '8',
        }));
        const issued = new TokenService(jwt, configured).issueRefreshToken();
        assert.equal(issued.expiresAt.getTime(), NOW + 45 * MINUTE);
        assert.equal(issued.sessionExpiresAt.getTime(), NOW + 8 * 60 * MINUTE);
    });
});

describe('web-pivotal startup session validation', () => {
    for (const idle of ['14', '15']) {
        it(`rejects idle=${idle} minutes with a 15-minute access TTL`, () => {
            assert.throws(() => new WebPivotalSettings(new ConfigService({
                PIVOTAL_IAM_SESSION_IDLE_TIMEOUT_MINUTES: idle,
            })), /PIVOTAL_IAM_SESSION_IDLE_TIMEOUT_MINUTES must be longer/);
        });
    }

    it('rejects an absolute timeout shorter than the idle timeout', () => {
        assert.throws(() => new WebPivotalSettings(new ConfigService({
            PIVOTAL_IAM_SESSION_IDLE_TIMEOUT_MINUTES: '61',
            PIVOTAL_IAM_SESSION_ABSOLUTE_TIMEOUT_HOURS: '1',
        })), /PIVOTAL_IAM_SESSION_ABSOLUTE_TIMEOUT_HOURS must not be shorter/);
    });

    it('allows equal absolute and idle windows when access TTL is shorter', () => {
        assert.doesNotThrow(() => new WebPivotalSettings(new ConfigService({
            PIVOTAL_IAM_SESSION_IDLE_TIMEOUT_MINUTES: '60',
            PIVOTAL_IAM_SESSION_ABSOLUTE_TIMEOUT_HOURS: '1',
        })));
    });

    for (const key of ['PIVOTAL_IAM_SESSION_IDLE_TIMEOUT_MINUTES', 'PIVOTAL_IAM_SESSION_ABSOLUTE_TIMEOUT_HOURS', 'PIVOTAL_IAM_ACCESS_TOKEN_TTL_SECONDS']) {
        it(`rejects invalid positive-integer values for ${key}`, () => {
            for (const value of ['0', '-1', 'abc', '1.5', '', 'Infinity']) {
                assert.throws(
                    () => new WebPivotalSettings(new ConfigService({[key]: value})),
                    new RegExp(`Invalid environment variable ${key}:`),
                    `Expected ${key}=${JSON.stringify(value)} to be rejected`,
                );
            }
        });
    }
});
