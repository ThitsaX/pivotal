import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {BadRequestException, ConflictException, NotFoundException} from '@nestjs/common';
import {
    RefreshTokenRepository,
    RolePermissionRepository,
    RoleRepository,
    UserRepository,
} from '../../../../../packages/core/auth/domain';
import {DeactivateUserCommand, DeactivateUserHandler} from '../../../../../packages/core/auth/domain/command';
import {ADMIN_ROLE_CODE, DFSP_USER_ROLE_CODE, PermissionKey, Role, User} from '../../../../../packages/core/auth/domain/model';

interface State {
    users:                Map<string, User>;
    roles:                Map<string, Role>;
    permissionsByRole:    Map<string, string[]>;
    adminCountExcluding:  Map<string, number>;
    deactivateCalls:      string[];
    invalidateTokensCalls: string[];
    revokeAllForUserCalls: string[];
}

function freshState(): State {
    return {
        users: new Map(),
        roles: new Map([
            ['role-admin', new Role(ADMIN_ROLE_CODE, 'Admin', 'HUB', null, true, 'role-admin')],
            ['role-dfsp',  new Role(DFSP_USER_ROLE_CODE, 'DFSP',  'DFSP', null, true, 'role-dfsp')],
        ]),
        permissionsByRole: new Map([
            ['role-admin', [PermissionKey.ADMIN_USERS_MANAGE]],
            ['role-dfsp',  [PermissionKey.AUDIT_TRANSACTIONS_LIST]],
        ]),
        adminCountExcluding:   new Map(),
        deactivateCalls:       [],
        invalidateTokensCalls: [],
        revokeAllForUserCalls: [],
    };
}

function addUser(state: State, id: string, email: string, roleId: string, isActive: boolean = true): User {
    const u = new User(email, 'HASH', roleId, null, false, id);
    u.isActive = isActive;
    state.users.set(id, u);
    return u;
}

function makeHandler(state: State): DeactivateUserHandler {
    const userRepo = {
        async findById(id: string): Promise<User | null> {
            return state.users.get(id) ?? null;
        },
        async deactivate(id: string): Promise<void> {
            state.deactivateCalls.push(id);
            const u = state.users.get(id);
            if (u != null) {
                u.isActive = false;
            }
        },
        async invalidateTokens(id: string): Promise<void> {
            state.invalidateTokensCalls.push(id);
        },
        async countActiveUsersGrantingPermission(_key: string, excludeUserId: string): Promise<number> {
            return state.adminCountExcluding.get(excludeUserId) ?? 0;
        },
    } as unknown as UserRepository;

    const roleRepo = {
        async findById(id: string): Promise<Role | null> {
            return state.roles.get(id) ?? null;
        },
    } as unknown as RoleRepository;

    const rpRepo = {
        async findPermissionKeysByRoleId(roleId: string): Promise<string[]> {
            return state.permissionsByRole.get(roleId) ?? [];
        },
    } as unknown as RolePermissionRepository;

    const tokenRepo = {
        async revokeAllForUser(id: string): Promise<void> {
            state.revokeAllForUserCalls.push(id);
        },
    } as unknown as RefreshTokenRepository;

    return new DeactivateUserHandler(userRepo, roleRepo, rpRepo, tokenRepo);
}

describe('DeactivateUserHandler', () => {

    it('deactivates a non-admin user; revokes refresh tokens and bumps the watermark', async () => {

        const state = freshState();
        addUser(state, 'caller', 'caller@x', 'role-admin');
        addUser(state, 'admin-2', 'admin2@x', 'role-admin');
        addUser(state, 'target', 't@x', 'role-dfsp');

        await makeHandler(state).execute(new DeactivateUserCommand(
            new DeactivateUserCommand.Input('target', 'caller'),
        ));

        assert.deepEqual(state.deactivateCalls, ['target']);
        assert.deepEqual(state.invalidateTokensCalls, ['target']);
        assert.deepEqual(state.revokeAllForUserCalls, ['target']);
    });

    it('rejects USER_SELF_LOCK when deactivating self', async () => {

        const state = freshState();
        addUser(state, 'caller', 'caller@x', 'role-admin');

        await assert.rejects(
            makeHandler(state).execute(new DeactivateUserCommand(
                new DeactivateUserCommand.Input('caller', 'caller'),
            )),
            (error: unknown) => error instanceof BadRequestException
                && (error.getResponse() as {code: string}).code === 'ADMIN_USER_SELF_LOCK',
        );
    });

    it('rejects 404 when the target does not exist', async () => {

        const state = freshState();
        addUser(state, 'caller', 'caller@x', 'role-admin');

        await assert.rejects(
            makeHandler(state).execute(new DeactivateUserCommand(
                new DeactivateUserCommand.Input('missing', 'caller'),
            )),
            (error: unknown) => error instanceof NotFoundException
                && (error.getResponse() as {code: string}).code === 'ADMIN_USER_NOT_FOUND',
        );
    });

    it('is a no-op when the user is already inactive', async () => {

        const state = freshState();
        addUser(state, 'caller', 'caller@x', 'role-admin');
        addUser(state, 'target', 't@x', 'role-dfsp', false);

        await makeHandler(state).execute(new DeactivateUserCommand(
            new DeactivateUserCommand.Input('target', 'caller'),
        ));

        assert.equal(state.deactivateCalls.length, 0);
        assert.equal(state.invalidateTokensCalls.length, 0);
        assert.equal(state.revokeAllForUserCalls.length, 0);
    });

    it('rejects USER_LAST_ADMIN when deactivating the only remaining admin', async () => {

        const state = freshState();
        addUser(state, 'caller', 'caller@x', 'role-admin');
        addUser(state, 'target', 't@x', 'role-admin');
        state.adminCountExcluding.set('target', 0);

        await assert.rejects(
            makeHandler(state).execute(new DeactivateUserCommand(
                new DeactivateUserCommand.Input('target', 'caller'),
            )),
            (error: unknown) => error instanceof ConflictException
                && (error.getResponse() as {code: string}).code === 'ADMIN_USER_LAST_ADMIN',
        );

        assert.equal(state.deactivateCalls.length, 0);
    });

    it('allows deactivating an admin when other active admins exist', async () => {

        const state = freshState();
        addUser(state, 'caller', 'caller@x', 'role-admin');
        addUser(state, 'admin-2', 'admin2@x', 'role-admin');
        addUser(state, 'target', 't@x', 'role-admin');
        state.adminCountExcluding.set('target', 2);

        await makeHandler(state).execute(new DeactivateUserCommand(
            new DeactivateUserCommand.Input('target', 'caller'),
        ));

        assert.deepEqual(state.deactivateCalls, ['target']);
    });
});
