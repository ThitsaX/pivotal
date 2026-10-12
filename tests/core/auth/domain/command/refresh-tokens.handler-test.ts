import * as assert from 'node:assert/strict';
import {beforeEach, describe, it, type TestContext} from 'node:test';
import {Snowflake} from '@shared/snowflake';
import {UnauthorizedException} from '@nestjs/common';
import {JwtService} from '@nestjs/jwt';
import {ConfigService} from '@nestjs/config';
import {WebPivotalSettings} from '../../../../../packages/apps/web-pivotal/required.settings';
import {RefreshTokensCommand} from '../../../../../packages/core/auth/domain/command/refresh-tokens.command';
import {RefreshTokensHandler} from '../../../../../packages/core/auth/domain/command/refresh-tokens.handler';
import {LoginCommand} from '../../../../../packages/core/auth/domain/command/login.command';
import {LoginHandler} from '../../../../../packages/core/auth/domain/command/login.handler';
import {RefreshToken, User} from '../../../../../packages/core/auth/domain/model';
import {TokenService, PasswordService} from '../../../../../packages/core/auth/domain/service';
import {RefreshTokenRepository, RoleRepository, RolePermissionRepository, UserRepository} from '../../../../../packages/core/auth/domain/repository';

const NOW = Date.parse('2026-10-01T00:00:00Z');
const MINUTE = 60_000;

function fixture() {
    const settings = new WebPivotalSettings(new ConfigService({PIVOTAL_IAM_JWT_SECRET: 'unit-test-only'}));
    const tokenService = new TokenService(new JwtService(), settings);
    const existing = new RefreshToken('1', '100', TokenService.hashRefreshToken('test-refresh'), new Date(NOW + 30 * MINUTE), new Date(NOW + 12 * 60 * MINUTE), '200');
    const saved: RefreshToken[] = [];
    const revoked: unknown[] = [];
    const repository = {
        findByTokenHash: async () => existing,
        save: async (token: RefreshToken) => { token.id = '201'; saved.push(token); return token; },
        markRevoked: async (...args: unknown[]) => { revoked.push(args); },
        revokeFamily: async (id: string) => { revoked.push(id); },
    } as unknown as RefreshTokenRepository;
    const user = new User('test@example.com', 'hash', '2', null, false, '1');
    user.isActive = true;
    const users = {findById: async () => user, findByEmail: async () => user, recordSuccessfulLogin: async () => {}} as unknown as UserRepository;
    const roles = {findById: async () => ({id: '2', code: 'ADMIN'})} as unknown as RoleRepository;
    const permissions = {findPermissionKeysByRoleId: async () => []} as unknown as RolePermissionRepository;
    const handler = new RefreshTokensHandler(repository, users, roles, permissions, tokenService);
    const login = new LoginHandler(users, roles, permissions, repository, {verify: async () => true} as unknown as PasswordService, tokenService, settings);
    return {existing, saved, revoked, handler, login};
}

describe('session expiry and rotation handlers', () => {
    beforeEach((t) => {
        let id = 1n;
        (t as TestContext).mock.method(Snowflake.get(), 'nextId', () => id++);
    });
    for (const kind of ['idle', 'absolute', 'legacy'] as const) {
        it(`rejects ${kind} expiry with AUTH_SESSION_EXPIRED before minting tokens`, async (t) => {
            t.mock.timers.enable({apis: ['Date'], now: NOW});
            const f = fixture();
            if (kind === 'idle') f.existing.expiresAt = new Date(NOW);
            if (kind === 'absolute') f.existing.sessionExpiresAt = new Date(NOW);
            if (kind === 'legacy') { f.existing.sessionExpiresAt = null; f.existing.revokedAt = new Date(NOW); }
            await assert.rejects(f.handler.execute(new RefreshTokensCommand(new RefreshTokensCommand.Input('test-refresh'))), (error: unknown) => {
                assert.ok(error instanceof UnauthorizedException);
                assert.equal((error.getResponse() as {code: string}).code, 'AUTH_SESSION_EXPIRED');
                assert.equal((error.getResponse() as {reason: string}).reason, kind === 'idle' ? 'idle' : 'absolute');
                return true;
            });
            assert.equal(f.saved.length, 0);
            assert.deepEqual(f.revoked, ['100']);
        });
    }

    it('persists and returns the original deadline and family on refresh', async (t) => {
        t.mock.timers.enable({apis: ['Date'], now: NOW + 20 * MINUTE});
        const f = fixture();
        const response = await f.handler.execute(new RefreshTokensCommand(new RefreshTokensCommand.Input('test-refresh')));
        assert.equal(f.saved.length, 1);
        assert.equal(f.saved[0].sessionExpiresAt?.getTime(), f.existing.sessionExpiresAt?.getTime());
        assert.equal(response.sessionExpiresAt.getTime(), f.existing.sessionExpiresAt?.getTime());
        assert.equal(response.refreshTokenExpiresAt.getTime(), NOW + 50 * MINUTE);
        assert.equal(response.sessionId, f.existing.familyId);
        assert.deepEqual(f.revoked, [['200', '201']]);
    });

    it('persists a fixed deadline when signing in', async (t) => {
        t.mock.timers.enable({apis: ['Date'], now: NOW});
        const f = fixture();
        const response = await f.login.execute(new LoginCommand(new LoginCommand.Input('test@example.com', 'test')));
        assert.equal(response.sessionExpiresAt.getTime(), NOW + 12 * 60 * MINUTE);
        assert.equal(f.saved[0].sessionExpiresAt?.getTime(), response.sessionExpiresAt.getTime());
        assert.equal(f.saved[0].familyId, response.sessionId);
    });

    it('retains replay detection for a revoked, unexpired refresh token', async (t) => {
        t.mock.timers.enable({apis: ['Date'], now: NOW});
        const f = fixture();
        f.existing.revokedAt = new Date(NOW);
        await assert.rejects(f.handler.execute(new RefreshTokensCommand(new RefreshTokensCommand.Input('test-refresh'))), (error: unknown) =>
            error instanceof UnauthorizedException && (error.getResponse() as {code: string}).code === 'AUTH_REFRESH_TOKEN_REUSE_DETECTED');
        assert.equal(f.saved.length, 0);
    });
});
