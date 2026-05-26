import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {BadRequestException, UnauthorizedException} from '@nestjs/common';
import {RefreshTokenRepository, UserRepository} from '../../../../../packages/core/auth/domain';
import {ChangePasswordCommand, ChangePasswordHandler} from '../../../../../packages/core/auth/domain/command';
import {User} from '../../../../../packages/core/auth/domain/model';
import {PasswordService} from '../../../../../packages/core/auth/domain/service';

interface Calls {
    updatePasswordHash:  Array<{id: string; hash: string; mustChangePassword: boolean}>;
    invalidateTokens:    string[];
    revokeAllForUser:    string[];
}

function makeUser(): User {
    const user = new User('admin@example.com', 'OLD_HASH', 'role-1', null, false, 'user-1');
    user.isActive = true;
    user.tokensInvalidatedAt = null;
    return user;
}

function makeUserRepository(user: User | null, calls: Calls): UserRepository {
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

function makeRefreshTokenRepository(calls: Calls): RefreshTokenRepository {
    return {
        async revokeAllForUser(userId: string): Promise<void> {
            calls.revokeAllForUser.push(userId);
        },
    } as unknown as RefreshTokenRepository;
}

function makePasswordService(currentValid: boolean, samePassword: boolean = false): PasswordService {
    let verifyCallNumber = 0;
    return {
        async verify(plaintext: string, hash: string): Promise<boolean> {
            verifyCallNumber += 1;
            // First verify call checks current password against stored hash;
            // second checks whether the new password equals the current password.
            if (verifyCallNumber === 1) {
                return currentValid;
            }
            return samePassword;
        },
        async hash(): Promise<string> {
            return 'NEW_HASH';
        },
    } as unknown as PasswordService;
}

function freshCalls(): Calls {
    return {updatePasswordHash: [], invalidateTokens: [], revokeAllForUser: []};
}

describe('ChangePasswordHandler', () => {

    it('updates the password, revokes refresh tokens, and invalidates active access tokens on success', async () => {

        const calls = freshCalls();
        const handler = new ChangePasswordHandler(
            makeUserRepository(makeUser(), calls),
            makeRefreshTokenRepository(calls),
            makePasswordService(true, false),
        );

        const output = await handler.execute(new ChangePasswordCommand(
            new ChangePasswordCommand.Input('user-1', 'old', 'new-password-123'),
        ));

        assert.equal(output.changed, true);
        assert.deepEqual(calls.updatePasswordHash, [{id: 'user-1', hash: 'NEW_HASH', mustChangePassword: false}]);
        assert.deepEqual(calls.revokeAllForUser, ['user-1']);
        assert.deepEqual(calls.invalidateTokens, ['user-1'], 'tokens_invalidated_at must be bumped so the in-flight access token is rejected on its next use');
    });

    it('rejects with INVALID_CREDENTIALS when the user is missing', async () => {

        const calls = freshCalls();
        const handler = new ChangePasswordHandler(
            makeUserRepository(null, calls),
            makeRefreshTokenRepository(calls),
            makePasswordService(true, false),
        );

        await assert.rejects(
            handler.execute(new ChangePasswordCommand(
                new ChangePasswordCommand.Input('user-1', 'old', 'new-password-123'),
            )),
            (error: unknown) => error instanceof UnauthorizedException
                && (error.getResponse() as {code: string}).code === 'AUTH_INVALID_CREDENTIALS',
        );

        assert.equal(calls.invalidateTokens.length, 0);
        assert.equal(calls.revokeAllForUser.length, 0);
    });

    it('rejects with INVALID_CREDENTIALS when the current password is wrong', async () => {

        const calls = freshCalls();
        const handler = new ChangePasswordHandler(
            makeUserRepository(makeUser(), calls),
            makeRefreshTokenRepository(calls),
            makePasswordService(false, false),
        );

        await assert.rejects(
            handler.execute(new ChangePasswordCommand(
                new ChangePasswordCommand.Input('user-1', 'wrong', 'new-password-123'),
            )),
            (error: unknown) => error instanceof UnauthorizedException
                && (error.getResponse() as {code: string}).code === 'AUTH_INVALID_CREDENTIALS',
        );

        assert.equal(calls.invalidateTokens.length, 0);
    });

    it('rejects with PASSWORD_SAME_AS_CURRENT when the new password equals the current one', async () => {

        const calls = freshCalls();
        const handler = new ChangePasswordHandler(
            makeUserRepository(makeUser(), calls),
            makeRefreshTokenRepository(calls),
            makePasswordService(true, true),
        );

        await assert.rejects(
            handler.execute(new ChangePasswordCommand(
                new ChangePasswordCommand.Input('user-1', 'old', 'old'),
            )),
            (error: unknown) => error instanceof BadRequestException
                && (error.getResponse() as {code: string}).code === 'AUTH_PASSWORD_SAME_AS_CURRENT',
        );

        assert.equal(calls.invalidateTokens.length, 0);
    });
});
