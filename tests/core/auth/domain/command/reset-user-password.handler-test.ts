import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {NotFoundException} from '@nestjs/common';
import {RefreshTokenRepository, RoleRepository, UserRepository} from '../../../../../packages/core/auth/domain';
import {ResetUserPasswordCommand, ResetUserPasswordHandler} from '../../../../../packages/core/auth/domain/command';
import {ADMIN_ROLE_CODE, Role, User} from '../../../../../packages/core/auth/domain/model';
import {PasswordService, TempPasswordService} from '../../../../../packages/core/auth/domain/service';

interface Calls {
    updatePasswordHash:    Array<{id: string; hash: string; mustChangePassword: boolean}>;
    invalidateTokens:      string[];
    revokeAllForUser:      string[];
}

function freshCalls(): Calls {
    return {updatePasswordHash: [], invalidateTokens: [], revokeAllForUser: []};
}

function adminRole(): Role {
    return new Role(ADMIN_ROLE_CODE, 'Admin', null, true, 'role-admin');
}

function makeUserRepo(user: User | null, calls: Calls): UserRepository {
    return {
        async findById(): Promise<User | null> {
            return user;
        },
        async updatePasswordHash(id: string, hash: string, mustChangePassword: boolean): Promise<void> {
            calls.updatePasswordHash.push({id, hash, mustChangePassword});
        },
        async invalidateTokens(id: string): Promise<void> {
            calls.invalidateTokens.push(id);
        },
    } as unknown as UserRepository;
}

function makeRoleRepo(): RoleRepository {
    return {
        async findById(): Promise<Role | null> {
            return adminRole();
        },
    } as unknown as RoleRepository;
}

function makeRefreshTokenRepo(calls: Calls): RefreshTokenRepository {
    return {
        async revokeAllForUser(id: string): Promise<void> {
            calls.revokeAllForUser.push(id);
        },
    } as unknown as RefreshTokenRepository;
}

function makePasswordService(): PasswordService {
    return {
        async hash(plain: string): Promise<string> {
            return `HASH(${plain})`;
        },
    } as unknown as PasswordService;
}

function makeTempPasswordService(): TempPasswordService {
    return {
        generate(): string {
            return 'Reset-Pass-12345!';
        },
    } as unknown as TempPasswordService;
}

describe('ResetUserPasswordHandler', () => {

    it('resets the password, revokes refresh tokens, invalidates access tokens, returns the temp password once', async () => {

        const calls = freshCalls();
        const user = new User('admin@x', 'OLD', 'role-admin', null, false, 'user-1');
        user.isActive = true;

        const handler = new ResetUserPasswordHandler(
            makeUserRepo(user, calls),
            makeRoleRepo(),
            makeRefreshTokenRepo(calls),
            makePasswordService(),
            makeTempPasswordService(),
        );

        const output = await handler.execute(new ResetUserPasswordCommand(
            new ResetUserPasswordCommand.Input('user-1'),
        ));

        assert.equal(output.tempPassword, 'Reset-Pass-12345!');
        assert.deepEqual(calls.updatePasswordHash, [{id: 'user-1', hash: 'HASH(Reset-Pass-12345!)', mustChangePassword: true}]);
        assert.deepEqual(calls.revokeAllForUser, ['user-1']);
        assert.deepEqual(calls.invalidateTokens, ['user-1']);
    });

    it('rejects 404 when the user is missing', async () => {

        const calls = freshCalls();
        const handler = new ResetUserPasswordHandler(
            makeUserRepo(null, calls),
            makeRoleRepo(),
            makeRefreshTokenRepo(calls),
            makePasswordService(),
            makeTempPasswordService(),
        );

        await assert.rejects(
            handler.execute(new ResetUserPasswordCommand(new ResetUserPasswordCommand.Input('missing'))),
            (error: unknown) => error instanceof NotFoundException
                && (error.getResponse() as {code: string}).code === 'ADMIN_USER_NOT_FOUND',
        );

        assert.equal(calls.updatePasswordHash.length, 0);
        assert.equal(calls.revokeAllForUser.length, 0);
        assert.equal(calls.invalidateTokens.length, 0);
    });
});
