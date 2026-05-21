import {Inject, Injectable, Logger} from '@nestjs/common';
import {DbTarget} from '@shared/typeorm';
import {
    ADMIN_ROLE_CODE,
    DFSP_USER_ROLE_CODE,
    Menu,
    MenuPermission,
    Permission,
    PermissionKey,
    Role,
    RolePermission,
} from '../model';
import {
    MenuPermissionRepository,
    MenuRepository,
    PermissionRepository,
    RolePermissionRepository,
    RoleRepository,
} from '../repository';

export interface RbacStepResult {
    inserted: number;
    skipped:  boolean;
}

export interface RbacSeedResult {
    roles:           RbacStepResult;
    permissions:     RbacStepResult;
    rolePermissions: RbacStepResult;
    menus:           RbacStepResult;
    menuPermissions: RbacStepResult;
}

interface RoleSeed {
    code:        string;
    name:        string;
    description: string;
}

interface PermissionSeed {
    keyName:     string;
    description: string;
}

interface MenuSeed {
    menuKey:    string;
    groupLabel: string;
    label:      string;
    route:      string;
    sortOrder:  number;
    permissionKey: string;
}

const ROLE_SEEDS: RoleSeed[] = [
    {code: ADMIN_ROLE_CODE,     name: 'System Administrator', description: 'Full access to all hub operations.'},
    {code: DFSP_USER_ROLE_CODE, name: 'DFSP Operator',        description: 'Operator scoped to a single FSP by fsp_id.'},
];

const PERMISSION_SEEDS: PermissionSeed[] = [
    {keyName: PermissionKey.HUB_CURRENCY_ADD,                description: 'Provision hub settlement accounts for a new currency.'},
    {keyName: PermissionKey.HUB_SIGNING_KEYS_UPDATE,         description: 'Update the hub-side JWS signing key pair.'},
    {keyName: PermissionKey.PARTICIPANT_LIST,                description: 'View the list of registered participants.'},
    {keyName: PermissionKey.PARTICIPANT_ONBOARD,             description: 'Onboard a new FSP into the hub.'},
    {keyName: PermissionKey.PARTICIPANT_CURRENCY_ADD,        description: 'Enable an additional currency for an existing participant.'},
    {keyName: PermissionKey.PARTICIPANT_ENDPOINT_REGISTER,   description: 'Register or replace a participant\'s callback endpoint.'},
    {keyName: PermissionKey.PARTICIPANT_SIGNING_KEYS_UPDATE, description: 'Update the JWS signing keys for a participant.'},
    {keyName: PermissionKey.AUDIT_TRANSACTIONS_LIST,         description: 'Query the audited transactions list.'},
    {keyName: PermissionKey.AUDIT_TRANSACTIONS_VIEW,         description: 'View a single audited transaction by transfer ID.'},
];

const ROLE_GRANTS: Record<string, string[]> = {
    [ADMIN_ROLE_CODE]: PERMISSION_SEEDS.map((p) => p.keyName),
    [DFSP_USER_ROLE_CODE]: [
        PermissionKey.AUDIT_TRANSACTIONS_LIST,
        PermissionKey.AUDIT_TRANSACTIONS_VIEW,
    ],
};

const MENU_SEEDS: MenuSeed[] = [
    {menuKey: 'hub-add-currency',              groupLabel: 'Hub',         label: 'Add Currency',         route: '/views/hub-add-currency',              sortOrder: 10, permissionKey: PermissionKey.HUB_CURRENCY_ADD},
    {menuKey: 'hub-list-participants',         groupLabel: 'Hub',         label: 'List Participants',    route: '/views/hub-list-participants',         sortOrder: 20, permissionKey: PermissionKey.PARTICIPANT_LIST},
    {menuKey: 'hub-add-signing-keys',          groupLabel: 'Hub',         label: 'Update Signing Keys',  route: '/views/hub-add-signing-keys',          sortOrder: 30, permissionKey: PermissionKey.HUB_SIGNING_KEYS_UPDATE},
    {menuKey: 'participant-onboarding',        groupLabel: 'Participant', label: 'Onboard FSP',          route: '/views/participant-onboarding',        sortOrder: 10, permissionKey: PermissionKey.PARTICIPANT_ONBOARD},
    {menuKey: 'participant-add-new-currency',  groupLabel: 'Participant', label: 'Add Currency',         route: '/views/participant-add-new-currency',  sortOrder: 20, permissionKey: PermissionKey.PARTICIPANT_CURRENCY_ADD},
    {menuKey: 'participant-register-endpoint', groupLabel: 'Participant', label: 'Register Endpoint',    route: '/views/participant-register-endpoint', sortOrder: 30, permissionKey: PermissionKey.PARTICIPANT_ENDPOINT_REGISTER},
    {menuKey: 'participant-add-signing-keys',  groupLabel: 'Participant', label: 'Update Signing Keys', route: '/views/participant-add-signing-keys',  sortOrder: 40, permissionKey: PermissionKey.PARTICIPANT_SIGNING_KEYS_UPDATE},
    {menuKey: 'transactions',                  groupLabel: 'Audit',       label: 'Find Transactions',    route: '/views/transactions',                  sortOrder: 10, permissionKey: PermissionKey.AUDIT_TRANSACTIONS_LIST},
];

@Injectable()
export class RbacSeeder {

    private static readonly LOGGER = new Logger(RbacSeeder.name);

    constructor(
        @Inject(RoleRepository)
        private readonly roleRepository: RoleRepository,
        @Inject(PermissionRepository)
        private readonly permissionRepository: PermissionRepository,
        @Inject(RolePermissionRepository)
        private readonly rolePermissionRepository: RolePermissionRepository,
        @Inject(MenuRepository)
        private readonly menuRepository: MenuRepository,
        @Inject(MenuPermissionRepository)
        private readonly menuPermissionRepository: MenuPermissionRepository,
    ) {
    }

    async seed(): Promise<RbacSeedResult> {

        const roles = await this.seedRoles();
        const permissions = await this.seedPermissions();
        const rolePermissions = await this.seedRolePermissions();
        const menus = await this.seedMenus();
        const menuPermissions = await this.seedMenuPermissions();

        return {roles, permissions, rolePermissions, menus, menuPermissions};
    }

    private async seedRoles(): Promise<RbacStepResult> {

        if (await this.roleRepository.count(DbTarget.Write) > 0) {
            RbacSeeder.LOGGER.log('roles already populated; skipping.');
            return {inserted: 0, skipped: true};
        }

        for (const seed of ROLE_SEEDS) {
            await this.roleRepository.save(new Role(seed.code, seed.name, seed.description, true));
        }

        RbacSeeder.LOGGER.log(`Seeded ${ROLE_SEEDS.length} role(s): ${ROLE_SEEDS.map((r) => r.code).join(', ')}.`);
        return {inserted: ROLE_SEEDS.length, skipped: false};
    }

    private async seedPermissions(): Promise<RbacStepResult> {

        if (await this.permissionRepository.count(DbTarget.Write) > 0) {
            RbacSeeder.LOGGER.log('permissions already populated; skipping.');
            return {inserted: 0, skipped: true};
        }

        for (const seed of PERMISSION_SEEDS) {
            await this.permissionRepository.save(new Permission(seed.keyName, seed.description));
        }

        RbacSeeder.LOGGER.log(`Seeded ${PERMISSION_SEEDS.length} permission(s).`);
        return {inserted: PERMISSION_SEEDS.length, skipped: false};
    }

    private async seedRolePermissions(): Promise<RbacStepResult> {

        if (await this.rolePermissionRepository.count(DbTarget.Write) > 0) {
            RbacSeeder.LOGGER.log('role_permissions already populated; skipping.');
            return {inserted: 0, skipped: true};
        }

        let inserted = 0;

        for (const [roleCode, permissionKeys] of Object.entries(ROLE_GRANTS)) {

            const role = await this.roleRepository.findByCode(roleCode, DbTarget.Write);

            if (role == null) {
                throw new Error(`Cannot seed role_permissions: role '${roleCode}' not found.`);
            }

            for (const permissionKey of permissionKeys) {

                const permission = await this.permissionRepository.findByKeyName(permissionKey, DbTarget.Write);

                if (permission == null) {
                    throw new Error(`Cannot seed role_permissions: permission '${permissionKey}' not found.`);
                }

                await this.rolePermissionRepository.save(new RolePermission(role.id, permission.id));
                inserted += 1;
            }
        }

        RbacSeeder.LOGGER.log(`Seeded ${inserted} role_permission link(s).`);
        return {inserted, skipped: false};
    }

    private async seedMenus(): Promise<RbacStepResult> {

        if (await this.menuRepository.count(DbTarget.Write) > 0) {
            RbacSeeder.LOGGER.log('menus already populated; skipping.');
            return {inserted: 0, skipped: true};
        }

        for (const seed of MENU_SEEDS) {
            await this.menuRepository.save(new Menu(
                seed.menuKey,
                seed.groupLabel,
                seed.label,
                seed.route,
                seed.sortOrder,
            ));
        }

        RbacSeeder.LOGGER.log(`Seeded ${MENU_SEEDS.length} menu(s).`);
        return {inserted: MENU_SEEDS.length, skipped: false};
    }

    private async seedMenuPermissions(): Promise<RbacStepResult> {

        if (await this.menuPermissionRepository.count(DbTarget.Write) > 0) {
            RbacSeeder.LOGGER.log('menu_permissions already populated; skipping.');
            return {inserted: 0, skipped: true};
        }

        let inserted = 0;

        for (const seed of MENU_SEEDS) {

            const menu = await this.menuRepository.findByMenuKey(seed.menuKey, DbTarget.Write);

            if (menu == null) {
                throw new Error(`Cannot seed menu_permissions: menu '${seed.menuKey}' not found.`);
            }

            const permission = await this.permissionRepository.findByKeyName(seed.permissionKey, DbTarget.Write);

            if (permission == null) {
                throw new Error(`Cannot seed menu_permissions: permission '${seed.permissionKey}' not found.`);
            }

            await this.menuPermissionRepository.save(new MenuPermission(menu.id, permission.id));
            inserted += 1;
        }

        RbacSeeder.LOGGER.log(`Seeded ${inserted} menu_permission link(s).`);
        return {inserted, skipped: false};
    }
}
