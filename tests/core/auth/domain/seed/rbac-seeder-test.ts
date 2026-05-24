import * as assert from 'node:assert/strict';
import {beforeEach, describe, it} from 'node:test';
import {
    ADMIN_ROLE_CODE,
    DFSP_USER_ROLE_CODE,
    Menu,
    MenuPermission,
    Permission,
    Role,
    RolePermission,
} from '../../../../../packages/core/auth/domain/model';
import {
    MenuPermissionRepository,
    MenuRepository,
    PermissionRepository,
    RolePermissionRepository,
    RoleRepository,
} from '../../../../../packages/core/auth/domain/repository';
import {RbacSeeder} from '../../../../../packages/core/auth/domain/seed';

interface State {
    roles:           Map<string, Role>;
    permissions:     Map<string, Permission>;
    rolePermissions: RolePermission[];
    menus:           Map<string, Menu>;
    menuPermissions: MenuPermission[];
    idSeq:           number;
}

function freshState(): State {
    return {
        roles:           new Map(),
        permissions:     new Map(),
        rolePermissions: [],
        menus:           new Map(),
        menuPermissions: [],
        idSeq:           1,
    };
}

function nextId(state: State): string {
    const id = String(state.idSeq);
    state.idSeq += 1;
    return id;
}

function makeRoleRepository(state: State): RoleRepository {
    return {
        async save(role: Role): Promise<Role> {
            role.id = nextId(state);
            state.roles.set(role.code, role);
            return role;
        },
        async findByCode(code: string): Promise<Role | null> {
            return state.roles.get(code) ?? null;
        },
        async count(): Promise<number> {
            return state.roles.size;
        },
    } as unknown as RoleRepository;
}

function makePermissionRepository(state: State): PermissionRepository {
    return {
        async save(perm: Permission): Promise<Permission> {
            perm.id = nextId(state);
            state.permissions.set(perm.keyName, perm);
            return perm;
        },
        async findByKeyName(key: string): Promise<Permission | null> {
            return state.permissions.get(key) ?? null;
        },
        async count(): Promise<number> {
            return state.permissions.size;
        },
    } as unknown as PermissionRepository;
}

function makeRolePermissionRepository(state: State): RolePermissionRepository {
    return {
        async save(rp: RolePermission): Promise<RolePermission> {
            state.rolePermissions.push(rp);
            return rp;
        },
        async count(): Promise<number> {
            return state.rolePermissions.length;
        },
    } as unknown as RolePermissionRepository;
}

function makeMenuRepository(state: State): MenuRepository {
    return {
        async save(menu: Menu): Promise<Menu> {
            menu.id = nextId(state);
            state.menus.set(menu.menuKey, menu);
            return menu;
        },
        async findByMenuKey(key: string): Promise<Menu | null> {
            return state.menus.get(key) ?? null;
        },
        async count(): Promise<number> {
            return state.menus.size;
        },
    } as unknown as MenuRepository;
}

function makeMenuPermissionRepository(state: State): MenuPermissionRepository {
    return {
        async save(mp: MenuPermission): Promise<MenuPermission> {
            state.menuPermissions.push(mp);
            return mp;
        },
        async count(): Promise<number> {
            return state.menuPermissions.length;
        },
    } as unknown as MenuPermissionRepository;
}

function makeSeeder(state: State): RbacSeeder {
    return new RbacSeeder(
        makeRoleRepository(state),
        makePermissionRepository(state),
        makeRolePermissionRepository(state),
        makeMenuRepository(state),
        makeMenuPermissionRepository(state),
    );
}

describe('RbacSeeder', () => {

    let state: State;

    beforeEach(() => {
        state = freshState();
    });

    it('cold-boot seeds 2 roles / 13 permissions / 15 role_permissions / 12 menus / 12 menu_permissions', async () => {

        const result = await makeSeeder(state).seed();

        assert.equal(result.roles.inserted, 2);
        assert.equal(result.permissions.inserted, 13);
        assert.equal(result.rolePermissions.inserted, 15);
        assert.equal(result.menus.inserted, 12);
        assert.equal(result.menuPermissions.inserted, 12);

        for (const step of Object.values(result)) {
            assert.equal(step.skipped, false);
        }
    });

    it('seeds both system roles', async () => {

        await makeSeeder(state).seed();

        assert.ok(state.roles.has(ADMIN_ROLE_CODE));
        assert.ok(state.roles.has(DFSP_USER_ROLE_CODE));
    });

    it('grants ADMIN all 13 permissions and DFSP_USER exactly the 2 audit permissions', async () => {

        await makeSeeder(state).seed();

        const adminRoleId = state.roles.get(ADMIN_ROLE_CODE)!.id;
        const dfspRoleId = state.roles.get(DFSP_USER_ROLE_CODE)!.id;

        const adminGrants = state.rolePermissions.filter((rp) => rp.roleId === adminRoleId);
        const dfspGrants = state.rolePermissions.filter((rp) => rp.roleId === dfspRoleId);

        assert.equal(adminGrants.length, 13);
        assert.equal(dfspGrants.length, 2);
    });

    it('seeds the four admin permission keys', async () => {

        await makeSeeder(state).seed();

        assert.ok(state.permissions.has('admin.users.manage'));
        assert.ok(state.permissions.has('admin.roles.manage'));
        assert.ok(state.permissions.has('admin.permissions.list'));
        assert.ok(state.permissions.has('admin.menus.manage'));
    });

    it('seeds the four Admin-group menus in sort_order', async () => {

        await makeSeeder(state).seed();

        const adminMenus = [...state.menus.values()]
            .filter((m) => m.groupLabel === 'Admin')
            .sort((a, b) => a.sortOrder - b.sortOrder);

        assert.equal(adminMenus.length, 4);
        assert.deepEqual(
            adminMenus.map((m) => m.menuKey),
            ['admin-users', 'admin-roles', 'admin-permissions', 'admin-menus'],
        );
        assert.deepEqual(
            adminMenus.map((m) => m.sortOrder),
            [10, 20, 30, 40],
        );
    });

    it('warm-boot is a no-op when every table already has rows', async () => {

        await makeSeeder(state).seed();
        const firstAdminPermCount = state.rolePermissions.length;

        const second = await makeSeeder(state).seed();

        for (const step of Object.values(second)) {
            assert.equal(step.inserted, 0);
            assert.equal(step.skipped, true);
        }
        assert.equal(state.rolePermissions.length, firstAdminPermCount, 'warm-boot must not duplicate role_permissions');
    });
});
