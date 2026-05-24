import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {BadRequestException, ConflictException, NotFoundException} from '@nestjs/common';
import {
    RefreshTokenRepository,
    RolePermissionRepository,
    RoleRepository,
    UserRepository,
} from '../../../../../packages/core/auth/domain';
import {UpdateUserCommand, UpdateUserHandler} from '../../../../../packages/core/auth/domain/command';
import {ADMIN_ROLE_CODE, DFSP_USER_ROLE_CODE, PermissionKey, Role, User} from '../../../../../packages/core/auth/domain/model';

interface State {
    users:                Map<string, User>;
    roles:                Map<string, Role>;
    permissionsByRole:    Map<string, string[]>;
    adminCountExcluding:  Map<string, number>;
    updateCalls:          Array<{id: string; partial: Record<string, unknown>}>;
    invalidateTokensCalls: string[];
    revokeAllForUserCalls: string[];
}

function freshState(): State {
    const adminRole = new Role(ADMIN_ROLE_CODE, 'Admin', null, true, 'role-admin');
    const dfspRole = new Role(DFSP_USER_ROLE_CODE, 'DFSP', null, true, 'role-dfsp');

    return {
        users:                 new Map(),
        roles:                 new Map([['role-admin', adminRole], ['role-dfsp', dfspRole]]),
        permissionsByRole:     new Map([
            ['role-admin', [PermissionKey.ADMIN_USERS_MANAGE]],
            ['role-dfsp',  [PermissionKey.AUDIT_TRANSACTIONS_LIST]],
        ]),
        adminCountExcluding:   new Map(),
        updateCalls:           [],
        invalidateTokensCalls: [],
        revokeAllForUserCalls: [],
    };
}

function addUser(state: State, id: string, email: string, roleId: string, fspId: string | null, isActive: boolean = true): User {
    const u = new User(email, 'HASH', roleId, fspId, false, id);
    u.isActive = isActive;
    state.users.set(id, u);
    return u;
}

function makeUserRepo(state: State): UserRepository {
    return {
        async findById(id: string): Promise<User | null> {
            return state.users.get(id) ?? null;
        },
        async update(id: string, partial: Record<string, unknown>): Promise<void> {
            state.updateCalls.push({id, partial});
            const u = state.users.get(id);
            if (u != null) {
                Object.assign(u, partial);
            }
        },
        async invalidateTokens(id: string): Promise<void> {
            state.invalidateTokensCalls.push(id);
        },
        async countActiveUsersGrantingPermission(_key: string, excludeUserId: string): Promise<number> {
            return state.adminCountExcluding.get(excludeUserId) ?? 0;
        },
    } as unknown as UserRepository;
}

function makeRoleRepo(state: State): RoleRepository {
    return {
        async findById(id: string): Promise<Role | null> {
            return state.roles.get(id) ?? null;
        },
    } as unknown as RoleRepository;
}

function makeRolePermissionRepo(state: State): RolePermissionRepository {
    return {
        async findPermissionKeysByRoleId(roleId: string): Promise<string[]> {
            return state.permissionsByRole.get(roleId) ?? [];
        },
    } as unknown as RolePermissionRepository;
}

function makeRefreshTokenRepo(state: State): RefreshTokenRepository {
    return {
        async revokeAllForUser(id: string): Promise<void> {
            state.revokeAllForUserCalls.push(id);
        },
    } as unknown as RefreshTokenRepository;
}

function makeHandler(state: State): UpdateUserHandler {
    return new UpdateUserHandler(
        makeUserRepo(state),
        makeRoleRepo(state),
        makeRolePermissionRepo(state),
        makeRefreshTokenRepo(state),
    );
}

describe('UpdateUserHandler', () => {

    it('updates role + fspId and bumps tokens_invalidated_at', async () => {

        const state = freshState();
        addUser(state, 'admin-1', 'admin1@x', 'role-admin', null);
        addUser(state, 'admin-2', 'admin2@x', 'role-admin', null);  // keeps last-admin guard happy
        addUser(state, 'target-1', 'target@x', 'role-dfsp', 'fsp-old');
        state.adminCountExcluding.set('target-1', 2);

        await makeHandler(state).execute(new UpdateUserCommand(
            new UpdateUserCommand.Input('target-1', 'admin-1', 'role-dfsp', 'fsp-new', undefined),
        ));

        assert.deepEqual(state.updateCalls[0].partial, {fspId: 'fsp-new'});
        assert.deepEqual(state.invalidateTokensCalls, ['target-1']);
        assert.equal(state.revokeAllForUserCalls.length, 0, 'role/fspId edit does not revoke refresh tokens');
    });

    it('rejects 404 when the target user does not exist', async () => {

        const state = freshState();
        addUser(state, 'admin-1', 'admin1@x', 'role-admin', null);

        await assert.rejects(
            makeHandler(state).execute(new UpdateUserCommand(
                new UpdateUserCommand.Input('missing', 'admin-1', undefined, undefined, false),
            )),
            (error: unknown) => error instanceof NotFoundException
                && (error.getResponse() as {code: string}).code === 'ADMIN_USER_NOT_FOUND',
        );
    });

    it('rejects USER_SELF_LOCK when the caller tries to change their own role', async () => {

        const state = freshState();
        addUser(state, 'admin-1', 'admin1@x', 'role-admin', null);

        await assert.rejects(
            makeHandler(state).execute(new UpdateUserCommand(
                new UpdateUserCommand.Input('admin-1', 'admin-1', 'role-dfsp', 'fsp-1', undefined),
            )),
            (error: unknown) => error instanceof BadRequestException
                && (error.getResponse() as {code: string}).code === 'ADMIN_USER_SELF_LOCK',
        );
    });

    it('rejects USER_SELF_LOCK when the caller tries to deactivate themselves', async () => {

        const state = freshState();
        addUser(state, 'admin-1', 'admin1@x', 'role-admin', null);

        await assert.rejects(
            makeHandler(state).execute(new UpdateUserCommand(
                new UpdateUserCommand.Input('admin-1', 'admin-1', undefined, undefined, false),
            )),
            (error: unknown) => error instanceof BadRequestException
                && (error.getResponse() as {code: string}).code === 'ADMIN_USER_SELF_LOCK',
        );
    });

    it('rejects USER_ADMIN_FORBIDS_FSP_ID when moving the user to ADMIN with a leftover fspId', async () => {

        const state = freshState();
        addUser(state, 'caller', 'a@x', 'role-admin', null);
        addUser(state, 'admin-2', 'admin2@x', 'role-admin', null);
        addUser(state, 'target', 't@x', 'role-dfsp', 'fsp-1');

        await assert.rejects(
            makeHandler(state).execute(new UpdateUserCommand(
                new UpdateUserCommand.Input('target', 'caller', 'role-admin', undefined, undefined),
            )),
            (error: unknown) => error instanceof BadRequestException
                && (error.getResponse() as {code: string}).code === 'ADMIN_USER_ADMIN_FORBIDS_FSP_ID',
        );
    });

    it('rejects USER_DFSP_REQUIRES_FSP_ID when moving the user to DFSP with no fspId', async () => {

        const state = freshState();
        addUser(state, 'caller', 'a@x', 'role-admin', null);
        addUser(state, 'admin-2', 'admin2@x', 'role-admin', null);
        addUser(state, 'target', 't@x', 'role-admin', null);
        state.adminCountExcluding.set('target', 1);  // caller is still an admin

        await assert.rejects(
            makeHandler(state).execute(new UpdateUserCommand(
                new UpdateUserCommand.Input('target', 'caller', 'role-dfsp', undefined, undefined),
            )),
            (error: unknown) => error instanceof BadRequestException
                && (error.getResponse() as {code: string}).code === 'ADMIN_USER_DFSP_REQUIRES_FSP_ID',
        );
    });

    it('rejects USER_LAST_ADMIN when moving the only remaining admin to a non-admin role', async () => {

        const state = freshState();
        addUser(state, 'caller', 'caller@x', 'role-admin', null);
        addUser(state, 'target', 't@x', 'role-admin', null);
        // adminCountExcluding('target') represents OTHER admins — only the caller remains, but caller is the actor
        // For the test scenario: target IS the last admin so excluding them yields 0.
        state.adminCountExcluding.set('target', 0);

        await assert.rejects(
            makeHandler(state).execute(new UpdateUserCommand(
                new UpdateUserCommand.Input('target', 'caller', 'role-dfsp', 'fsp-1', undefined),
            )),
            (error: unknown) => error instanceof ConflictException
                && (error.getResponse() as {code: string}).code === 'ADMIN_USER_LAST_ADMIN',
        );
    });

    it('allows role change away from admin when other active admins exist', async () => {

        const state = freshState();
        addUser(state, 'caller', 'caller@x', 'role-admin', null);
        addUser(state, 'admin-2', 'admin2@x', 'role-admin', null);
        addUser(state, 'target', 't@x', 'role-admin', null);
        state.adminCountExcluding.set('target', 2);

        await makeHandler(state).execute(new UpdateUserCommand(
            new UpdateUserCommand.Input('target', 'caller', 'role-dfsp', 'fsp-1', undefined),
        ));

        assert.equal(state.updateCalls[0].partial.roleId, 'role-dfsp');
        assert.equal(state.updateCalls[0].partial.fspId, 'fsp-1');
        assert.deepEqual(state.invalidateTokensCalls, ['target']);
    });

    it('deactivating a non-self user revokes refresh tokens and bumps the watermark', async () => {

        const state = freshState();
        addUser(state, 'caller', 'caller@x', 'role-admin', null);
        addUser(state, 'admin-2', 'admin2@x', 'role-admin', null);
        addUser(state, 'target', 't@x', 'role-dfsp', 'fsp-1');

        await makeHandler(state).execute(new UpdateUserCommand(
            new UpdateUserCommand.Input('target', 'caller', undefined, undefined, false),
        ));

        assert.deepEqual(state.updateCalls[0].partial, {isActive: false});
        assert.deepEqual(state.invalidateTokensCalls, ['target']);
        assert.deepEqual(state.revokeAllForUserCalls, ['target']);
    });

    it('rejects USER_LAST_ADMIN when deactivating the only remaining admin', async () => {

        const state = freshState();
        addUser(state, 'caller', 'caller@x', 'role-admin', null);
        addUser(state, 'target', 't@x', 'role-admin', null);
        state.adminCountExcluding.set('target', 0);

        await assert.rejects(
            makeHandler(state).execute(new UpdateUserCommand(
                new UpdateUserCommand.Input('target', 'caller', undefined, undefined, false),
            )),
            (error: unknown) => error instanceof ConflictException
                && (error.getResponse() as {code: string}).code === 'ADMIN_USER_LAST_ADMIN',
        );
    });
});
