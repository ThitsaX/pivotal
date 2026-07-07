import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {UnauthorizedException} from '@nestjs/common';
import {
    RefreshTokenRepository,
    RolePermissionRepository,
    RoleRepository,
    UserRepository,
} from '../../../../../packages/core/auth/domain';
import {LoginCommand, LoginHandler} from '../../../../../packages/core/auth/domain/command';
import {User} from '../../../../../packages/core/auth/domain/model';
import {AuthDomainSettings, PasswordService, TokenService} from '../../../../../packages/core/auth/domain/service';

interface LoginState {
    user: User | null;
    passwordValid: boolean;
    incrementFailedAttemptsCalls: string[];
    lockUntilCalls: Array<{id: string; until: Date}>;
    verifyCalls: number;
}

function makeUser(overrides: Partial<User> = {}): User {
    const user = new User('user@example.com', 'HASH', 'role-1', null, false, 'user-1');
    user.isActive = true;
    user.failedLoginAttempts = 0;
    Object.assign(user, overrides);
    return user;
}

function makeUserRepo(state: LoginState): UserRepository {
    return {
        async findByEmail(): Promise<User | null> {
            return state.user;
        },
        async incrementFailedAttempts(id: string): Promise<void> {
            state.incrementFailedAttemptsCalls.push(id);
            if (state.user != null) {
                state.user.failedLoginAttempts += 1;
            }
        },
        async lockUntil(id: string, until: Date): Promise<void> {
            state.lockUntilCalls.push({id, until});
            if (state.user != null) {
                state.user.lockedUntil = until;
            }
        },
    } as unknown as UserRepository;
}

function makePasswordService(state: LoginState): PasswordService {
    return {
        async verify(): Promise<boolean> {
            state.verifyCalls += 1;
            return state.passwordValid;
        },
    } as unknown as PasswordService;
}

function makeSettings(): AuthDomainSettings {
    return {
        jwtSecret:                    () => 'secret',
        jwtIssuer:                    () => 'pivotal',
        accessTokenTtlSeconds:        () => 900,
        refreshTokenTtlDays:          () => 7,
        bcryptCostFactor:             () => 4,
        loginLockoutThreshold:        () => 5,
        loginLockoutDurationMinutes:  () => 15,
        adminSeedEmail:               () => 'admin@example.com',
        adminSeedTempPassword:        () => 'ChangeMe123!',
    };
}

function makeHandler(state: LoginState): LoginHandler {
    return new LoginHandler(
        makeUserRepo(state),
        {} as RoleRepository,
        {} as RolePermissionRepository,
        {} as RefreshTokenRepository,
        makePasswordService(state),
        {} as TokenService,
        makeSettings(),
    );
}

describe('LoginHandler', () => {

    it('locks and returns ACCOUNT_LOCKED on the threshold failed attempt', async () => {

        const state: LoginState = {
            user: makeUser({failedLoginAttempts: 4}),
            passwordValid: false,
            incrementFailedAttemptsCalls: [],
            lockUntilCalls: [],
            verifyCalls: 0,
        };

        await assert.rejects(
            makeHandler(state).execute(new LoginCommand(new LoginCommand.Input('user@example.com', 'bad'))),
            (error: unknown) => error instanceof UnauthorizedException
                && (error.getResponse() as {code: string; message: string}).code === 'AUTH_ACCOUNT_LOCKED'
                && (error.getResponse() as {code: string; message: string}).message
                    === 'Your account has been temporarily locked due to multiple failed login attempts. Please try again after 15 minutes or contact your administrator.',
        );

        assert.deepEqual(state.incrementFailedAttemptsCalls, ['user-1']);
        assert.equal(state.lockUntilCalls.length, 1);
    });

    it('blocks locked accounts without checking the password', async () => {

        const state: LoginState = {
            user: makeUser({lockedUntil: new Date(Date.now() + 10 * 60 * 1000)}),
            passwordValid: true,
            incrementFailedAttemptsCalls: [],
            lockUntilCalls: [],
            verifyCalls: 0,
        };

        await assert.rejects(
            makeHandler(state).execute(new LoginCommand(new LoginCommand.Input('user@example.com', 'correct'))),
            (error: unknown) => error instanceof UnauthorizedException
                && (error.getResponse() as {code: string; message: string}).code === 'AUTH_ACCOUNT_LOCKED'
                && (error.getResponse() as {code: string; message: string}).message.includes('contact your administrator'),
        );

        assert.equal(state.verifyCalls, 0);
        assert.equal(state.incrementFailedAttemptsCalls.length, 0);
        assert.equal(state.lockUntilCalls.length, 0);
    });

    it('returns INVALID_CREDENTIALS before the failed-attempt threshold', async () => {

        const state: LoginState = {
            user: makeUser({failedLoginAttempts: 3}),
            passwordValid: false,
            incrementFailedAttemptsCalls: [],
            lockUntilCalls: [],
            verifyCalls: 0,
        };

        await assert.rejects(
            makeHandler(state).execute(new LoginCommand(new LoginCommand.Input('user@example.com', 'bad'))),
            (error: unknown) => error instanceof UnauthorizedException
                && (error.getResponse() as {code: string}).code === 'AUTH_INVALID_CREDENTIALS',
        );

        assert.deepEqual(state.incrementFailedAttemptsCalls, ['user-1']);
        assert.equal(state.lockUntilCalls.length, 0);
    });

});
