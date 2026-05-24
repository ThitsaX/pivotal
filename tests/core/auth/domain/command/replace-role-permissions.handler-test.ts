import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {BadRequestException, ConflictException, NotFoundException} from '@nestjs/common';
import {
    PermissionRepository,
    RolePermissionRepository,
    RoleRepository,
    UserRepository,
} from '../../../../../packages/core/auth/domain';
import {ReplaceRolePermissionsCommand, ReplaceRolePermissionsHandler}
    from '../../../../../packages/core/auth/domain/command';
import {ADMIN_ROLE_CODE, Permission, PermissionKey, Role} from '../../../../../packages/core/auth/domain/model';

interface State {
    rolesById:           Map<string, Role>;
    permissionsByKey:    Map<string, Permission>;
    currentKeysByRoleId: Map<string, string[]>;
    replaceCalls:        Array<{roleId: string; permissionIds: string[]}>;
    invalidateForRoleCalls: string[];
}

function freshState(): State {
    const state: State = {
        rolesById:           new Map(),
        permissionsByKey:    new Map(),
        currentKeysByRoleId: new Map(),
        replaceCalls:        [],
        invalidateForRoleCalls: [],
    };

    // Seed a few permissions
    const allKeys = [
        PermissionKey.ADMIN_USERS_MANAGE,
        PermissionKey.ADMIN_ROLES_MANAGE,
        PermissionKey.ADMIN_MENUS_MANAGE,
        PermissionKey.ADMIN_PERMISSIONS_LIST,
        PermissionKey.AUDIT_TRANSACTIONS_LIST,
        PermissionKey.AUDIT_TRANSACTIONS_VIEW,
        PermissionKey.PARTICIPANT_LIST,
    ];
    for (const [i, key] of allKeys.entries()) {
        const p = new Permission(key, `${key} desc`, `perm-${i + 1}`);
        state.permissionsByKey.set(key, p);
    }

    return state;
}

function addSystemRole(state: State, id: string, code: string, currentKeys: string[]): Role {
    const r = new Role(code, code, null, true, id);
    state.rolesById.set(id, r);
    state.currentKeysByRoleId.set(id, currentKeys);
    return r;
}

function addUserRole(state: State, id: string, code: string, currentKeys: string[]): Role {
    const r = new Role(code, code, null, false, id);
    state.rolesById.set(id, r);
    state.currentKeysByRoleId.set(id, currentKeys);
    return r;
}

function makeHandler(state: State): ReplaceRolePermissionsHandler {
    const roleRepo = {
        async findById(id: string): Promise<Role | null> {
            return state.rolesById.get(id) ?? null;
        },
    } as unknown as RoleRepository;

    const permRepo = {
        async findByKeyNames(keys: string[]): Promise<Permission[]> {
            return keys
                .map((k) => state.permissionsByKey.get(k))
                .filter((p): p is Permission => p != null);
        },
    } as unknown as PermissionRepository;

    const rpRepo = {
        async findPermissionKeysByRoleId(roleId: string): Promise<string[]> {
            return state.currentKeysByRoleId.get(roleId) ?? [];
        },
        async replaceForRole(roleId: string, permissionIds: string[]): Promise<void> {
            state.replaceCalls.push({roleId, permissionIds});
        },
    } as unknown as RolePermissionRepository;

    const userRepo = {
        async invalidateTokensForRole(roleId: string): Promise<void> {
            state.invalidateForRoleCalls.push(roleId);
        },
    } as unknown as UserRepository;

    return new ReplaceRolePermissionsHandler(roleRepo, permRepo, rpRepo, userRepo);
}

describe('ReplaceRolePermissionsHandler', () => {

    it('atomically replaces the permission set and invalidates tokens for everyone in the role', async () => {

        const state = freshState();
        addUserRole(state, 'role-ops', 'OPS', [PermissionKey.PARTICIPANT_LIST]);

        const output = await makeHandler(state).execute(new ReplaceRolePermissionsCommand(
            new ReplaceRolePermissionsCommand.Input('role-ops', [
                PermissionKey.AUDIT_TRANSACTIONS_LIST,
                PermissionKey.AUDIT_TRANSACTIONS_VIEW,
            ]),
        ));

        assert.equal(state.replaceCalls.length, 1);
        assert.equal(state.replaceCalls[0].roleId, 'role-ops');
        assert.equal(state.replaceCalls[0].permissionIds.length, 2);
        assert.deepEqual(state.invalidateForRoleCalls, ['role-ops']);
        assert.deepEqual(output.permissionKeys.sort(), [
            PermissionKey.AUDIT_TRANSACTIONS_LIST,
            PermissionKey.AUDIT_TRANSACTIONS_VIEW,
        ].sort());
    });

    it('deduplicates incoming permission keys', async () => {

        const state = freshState();
        addUserRole(state, 'role-ops', 'OPS', []);

        await makeHandler(state).execute(new ReplaceRolePermissionsCommand(
            new ReplaceRolePermissionsCommand.Input('role-ops', [
                PermissionKey.AUDIT_TRANSACTIONS_LIST,
                PermissionKey.AUDIT_TRANSACTIONS_LIST,
                PermissionKey.AUDIT_TRANSACTIONS_VIEW,
            ]),
        ));

        assert.equal(state.replaceCalls[0].permissionIds.length, 2);
    });

    it('rejects 404 when the role does not exist', async () => {

        const state = freshState();
        await assert.rejects(
            makeHandler(state).execute(new ReplaceRolePermissionsCommand(
                new ReplaceRolePermissionsCommand.Input('missing', []),
            )),
            (error: unknown) => error instanceof NotFoundException
                && (error.getResponse() as {code: string}).code === 'ADMIN_ROLE_NOT_FOUND',
        );
    });

    it('rejects 400 PERMISSION_NOT_FOUND when an incoming key does not exist', async () => {

        const state = freshState();
        addUserRole(state, 'role-ops', 'OPS', []);

        await assert.rejects(
            makeHandler(state).execute(new ReplaceRolePermissionsCommand(
                new ReplaceRolePermissionsCommand.Input('role-ops', ['does.not.exist']),
            )),
            (error: unknown) => error instanceof BadRequestException
                && (error.getResponse() as {code: string}).code === 'ADMIN_PERMISSION_NOT_FOUND',
        );
        assert.equal(state.replaceCalls.length, 0);
    });

    it('rejects 409 ROLE_CANNOT_REMOVE_ADMIN_KEY when a system role would lose an admin.* key', async () => {

        const state = freshState();
        addSystemRole(state, 'role-admin', ADMIN_ROLE_CODE, [
            PermissionKey.ADMIN_USERS_MANAGE,
            PermissionKey.ADMIN_ROLES_MANAGE,
            PermissionKey.AUDIT_TRANSACTIONS_LIST,
        ]);

        // Payload drops ADMIN_USERS_MANAGE — must be rejected.
        await assert.rejects(
            makeHandler(state).execute(new ReplaceRolePermissionsCommand(
                new ReplaceRolePermissionsCommand.Input('role-admin', [
                    PermissionKey.ADMIN_ROLES_MANAGE,
                    PermissionKey.AUDIT_TRANSACTIONS_LIST,
                ]),
            )),
            (error: unknown) => error instanceof ConflictException
                && (error.getResponse() as {code: string}).code === 'ADMIN_ROLE_CANNOT_REMOVE_ADMIN_KEY',
        );
        assert.equal(state.replaceCalls.length, 0);
        assert.equal(state.invalidateForRoleCalls.length, 0);
    });

    it('allows system role edits that keep all admin.* keys and add/remove non-admin keys', async () => {

        const state = freshState();
        addSystemRole(state, 'role-admin', ADMIN_ROLE_CODE, [
            PermissionKey.ADMIN_USERS_MANAGE,
            PermissionKey.ADMIN_ROLES_MANAGE,
            PermissionKey.AUDIT_TRANSACTIONS_LIST,
        ]);

        await makeHandler(state).execute(new ReplaceRolePermissionsCommand(
            new ReplaceRolePermissionsCommand.Input('role-admin', [
                PermissionKey.ADMIN_USERS_MANAGE,
                PermissionKey.ADMIN_ROLES_MANAGE,
                PermissionKey.PARTICIPANT_LIST,
            ]),
        ));

        assert.equal(state.replaceCalls.length, 1);
        assert.deepEqual(state.invalidateForRoleCalls, ['role-admin']);
    });

    it('non-system roles can drop admin.* keys freely', async () => {

        const state = freshState();
        addUserRole(state, 'role-custom', 'CUSTOM', [PermissionKey.ADMIN_USERS_MANAGE]);

        await makeHandler(state).execute(new ReplaceRolePermissionsCommand(
            new ReplaceRolePermissionsCommand.Input('role-custom', [PermissionKey.PARTICIPANT_LIST]),
        ));

        assert.equal(state.replaceCalls.length, 1);
        assert.deepEqual(state.invalidateForRoleCalls, ['role-custom']);
    });
});
