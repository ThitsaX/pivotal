import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {ConflictException, ForbiddenException} from '@nestjs/common';
import {
    RolePermissionRepository,
    RoleRepository,
    UserManagementPolicy,
    UserRepository,
} from '../../../../../packages/core/auth/domain';
import {
    ADMIN_ROLE_CODE,
    DFSP_ADMIN_ROLE_CODE,
    DFSP_USER_ROLE_CODE,
    PermissionKey,
    Role,
    User,
} from '../../../../../packages/core/auth/domain/model';

interface State {
    users: Map<string, User>;
    roles: Map<string, Role>;
    permissionKeysByRoleId: Map<string, string[]>;
    dfspAdminCountExcluding: Map<string, number>;
}

function freshState(): State {
    const adminRole = new Role(ADMIN_ROLE_CODE, 'System Administrator', 'HUB', null, true, 'role-admin');
    const dfspAdminRole = new Role(DFSP_ADMIN_ROLE_CODE, 'DFSP Administrator', 'DFSP', null, true, 'role-dfsp-admin');
    const hubOperatorRole = new Role('HUB OPERATOR', 'HUB OPERATOR', 'HUB', null, false, 'role-hub-operator');
    const dfspUserRole = new Role(DFSP_USER_ROLE_CODE, 'DFSP Operator', 'DFSP', null, true, 'role-dfsp-user');
    const customDfspManagerRole = new Role('CUSTOM_DFSP_MANAGER', 'Custom DFSP Manager', 'DFSP', null, false, 'role-custom-dfsp-manager');

    return {
        users: new Map(),
        roles: new Map([
            [adminRole.id, adminRole],
            [dfspAdminRole.id, dfspAdminRole],
            [hubOperatorRole.id, hubOperatorRole],
            [dfspUserRole.id, dfspUserRole],
            [customDfspManagerRole.id, customDfspManagerRole],
        ]),
        permissionKeysByRoleId: new Map([
            [adminRole.id, [PermissionKey.ADMIN_USERS_MANAGE]],
            [dfspAdminRole.id, [PermissionKey.ADMIN_DFSP_USERS_MANAGE, PermissionKey.AUDIT_TRANSACTIONS_LIST]],
            [hubOperatorRole.id, [PermissionKey.ADMIN_USERS_MANAGE, PermissionKey.AUDIT_TRANSACTIONS_LIST]],
            [dfspUserRole.id, [PermissionKey.AUDIT_TRANSACTIONS_LIST]],
            [customDfspManagerRole.id, [PermissionKey.ADMIN_DFSP_USERS_MANAGE]],
        ]),
        dfspAdminCountExcluding: new Map(),
    };
}

function addUser(state: State, id: string, roleId: string, fspId: string | null, isActive: boolean = true): User {
    const user = new User(`${id}@example.com`, 'HASH', roleId, fspId, false, id);
    user.isActive = isActive;
    state.users.set(id, user);
    return user;
}

function makePolicy(state: State): UserManagementPolicy {
    const userRepository = {
        async findById(id: string): Promise<User | null> {
            return state.users.get(id) ?? null;
        },
        async countActiveUsersByRoleCodeForFsp(roleCode: string, fspId: string, excludeUserId: string): Promise<number> {
            assert.equal(roleCode, DFSP_ADMIN_ROLE_CODE);
            return state.dfspAdminCountExcluding.get(`${fspId}:${excludeUserId}`) ?? 0;
        },
    } as unknown as UserRepository;

    const roleRepository = {
        async findById(id: string): Promise<Role | null> {
            return state.roles.get(id) ?? null;
        },
    } as unknown as RoleRepository;

    const rolePermissionRepository = {
        async findPermissionKeysByRoleId(roleId: string): Promise<string[]> {
            return state.permissionKeysByRoleId.get(roleId) ?? [];
        },
    } as unknown as RolePermissionRepository;

    return new UserManagementPolicy(userRepository, roleRepository, rolePermissionRepository);
}

describe('UserManagementPolicy', () => {

    it('resolves a DFSP manager with its own FSP as the management scope', async () => {

        const state = freshState();
        addUser(state, 'actor', 'role-dfsp-admin', 'wallet1');

        const context = await makePolicy(state).resolveManagementContext('actor');

        assert.equal(context.globalManager, false);
        assert.equal(context.dfspManager, true);
        assert.equal(context.managementFspId, 'wallet1');
    });

    it('allows DFSP managers to manage only users from the same FSP', async () => {

        const state = freshState();
        addUser(state, 'actor', 'role-dfsp-admin', 'wallet1');
        const sameFsp = addUser(state, 'same', 'role-dfsp-user', 'wallet1');
        const otherFsp = addUser(state, 'other', 'role-dfsp-user', 'wallet2');

        const policy = makePolicy(state);
        const context = await policy.resolveManagementContext('actor');

        assert.doesNotThrow(() => policy.assertCanManageTarget(context, sameFsp));
        assert.throws(
            () => policy.assertCanManageTarget(context, otherFsp),
            (error: unknown) => error instanceof ForbiddenException
                && (error.getResponse() as {code: string}).code === 'ADMIN_USER_MANAGEMENT_SCOPE_DENIED',
        );
    });

    it('allows DFSP managers to assign DFSP roles except the DFSP_ADMIN role code', async () => {

        const state = freshState();
        addUser(state, 'actor', 'role-dfsp-admin', 'wallet1');

        const policy = makePolicy(state);
        const context = await policy.resolveManagementContext('actor');

        assert.equal(await policy.canAssignRole(context, state.roles.get('role-dfsp-user')!), true);
        assert.equal(await policy.canAssignRole(context, state.roles.get('role-custom-dfsp-manager')!), true);
        assert.equal(await policy.canAssignRole(context, state.roles.get('role-dfsp-admin')!), false);
        assert.equal(await policy.canAssignRole(context, state.roles.get('role-admin')!), false);
    });


    it('does not let non-System Administrator HUB managers assign the ADMIN role', async () => {

        const state = freshState();
        addUser(state, 'actor', 'role-hub-operator', null);

        const policy = makePolicy(state);
        const context = await policy.resolveManagementContext('actor');

        assert.equal(context.globalManager, true);
        assert.equal(await policy.canAssignRole(context, state.roles.get('role-admin')!), false);
        assert.equal(await policy.canAssignRole(context, state.roles.get('role-hub-operator')!), true);
        assert.equal(await policy.canAssignRole(context, state.roles.get('role-dfsp-user')!), true);
    });

    it('forces DFSP-created users onto the actor FSP regardless of the request value', async () => {

        const state = freshState();
        addUser(state, 'actor', 'role-dfsp-admin', 'wallet1');

        const context = await makePolicy(state).resolveManagementContext('actor');

        assert.equal(makePolicy(state).resolveCreateFspId(context, 'wallet2'), 'wallet1');
    });

    it('rejects removing the last active DFSP_ADMIN role user for an FSP', async () => {

        const state = freshState();
        const target = addUser(state, 'target', 'role-dfsp-admin', 'wallet1');
        state.dfspAdminCountExcluding.set('wallet1:target', 0);

        await assert.rejects(
            makePolicy(state).assertNotLastDfspManager(target, 'role-dfsp-admin', 'role-dfsp-user', 'wallet1', false),
            (error: unknown) => error instanceof ConflictException
                && (error.getResponse() as {code: string}).code === 'ADMIN_USER_LAST_DFSP_ADMIN',
        );
    });
});