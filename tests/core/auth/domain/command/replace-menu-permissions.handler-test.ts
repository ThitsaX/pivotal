import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {BadRequestException, NotFoundException} from '@nestjs/common';
import {MenuPermissionRepository, MenuRepository, PermissionRepository}
    from '../../../../../packages/core/auth/domain';
import {ReplaceMenuPermissionsCommand, ReplaceMenuPermissionsHandler}
    from '../../../../../packages/core/auth/domain/command';
import {Menu, Permission, PermissionKey} from '../../../../../packages/core/auth/domain/model';

interface State {
    menusById:        Map<string, Menu>;
    permissionsByKey: Map<string, Permission>;
    replaceCalls:     Array<{menuId: string; permissionIds: string[]}>;
}

function freshState(): State {
    const state: State = {
        menusById:        new Map(),
        permissionsByKey: new Map(),
        replaceCalls:     [],
    };
    const keys = [
        PermissionKey.AUDIT_TRANSACTIONS_LIST,
        PermissionKey.AUDIT_TRANSACTIONS_VIEW,
        PermissionKey.PARTICIPANT_LIST,
    ];
    for (const [i, k] of keys.entries()) {
        state.permissionsByKey.set(k, new Permission(k, null, `perm-${i + 1}`));
    }
    return state;
}

function makeHandler(state: State): ReplaceMenuPermissionsHandler {
    const menuRepo = {
        async findById(id: string): Promise<Menu | null> {
            return state.menusById.get(id) ?? null;
        },
    } as unknown as MenuRepository;

    const permRepo = {
        async findByKeyNames(keys: string[]): Promise<Permission[]> {
            return keys.map((k) => state.permissionsByKey.get(k)).filter((p): p is Permission => p != null);
        },
    } as unknown as PermissionRepository;

    const mpRepo = {
        async replaceForMenu(menuId: string, permissionIds: string[]): Promise<void> {
            state.replaceCalls.push({menuId, permissionIds});
        },
    } as unknown as MenuPermissionRepository;

    return new ReplaceMenuPermissionsHandler(menuRepo, permRepo, mpRepo);
}

describe('ReplaceMenuPermissionsHandler', () => {

    it('atomically replaces the menu-permission set', async () => {

        const state = freshState();
        state.menusById.set('menu-1', new Menu('transactions', 'Audit', 'Find', '/v', 10, null, null, 'menu-1'));

        const output = await makeHandler(state).execute(new ReplaceMenuPermissionsCommand(
            new ReplaceMenuPermissionsCommand.Input('menu-1', [
                PermissionKey.AUDIT_TRANSACTIONS_LIST,
                PermissionKey.AUDIT_TRANSACTIONS_VIEW,
            ]),
        ));

        assert.equal(state.replaceCalls.length, 1);
        assert.equal(state.replaceCalls[0].menuId, 'menu-1');
        assert.equal(state.replaceCalls[0].permissionIds.length, 2);
        assert.deepEqual(output.permissionKeys.sort(), [
            PermissionKey.AUDIT_TRANSACTIONS_LIST,
            PermissionKey.AUDIT_TRANSACTIONS_VIEW,
        ].sort());
    });

    it('deduplicates incoming keys', async () => {

        const state = freshState();
        state.menusById.set('menu-1', new Menu('m', 'g', 'l', '/r', 0, null, null, 'menu-1'));

        await makeHandler(state).execute(new ReplaceMenuPermissionsCommand(
            new ReplaceMenuPermissionsCommand.Input('menu-1', [
                PermissionKey.PARTICIPANT_LIST,
                PermissionKey.PARTICIPANT_LIST,
            ]),
        ));

        assert.equal(state.replaceCalls[0].permissionIds.length, 1);
    });

    it('rejects 404 when the menu does not exist', async () => {

        const state = freshState();
        await assert.rejects(
            makeHandler(state).execute(new ReplaceMenuPermissionsCommand(
                new ReplaceMenuPermissionsCommand.Input('missing', []),
            )),
            (error: unknown) => error instanceof NotFoundException
                && (error.getResponse() as {code: string}).code === 'ADMIN_MENU_NOT_FOUND',
        );
    });

    it('rejects 400 PERMISSION_NOT_FOUND when an incoming key is unknown', async () => {

        const state = freshState();
        state.menusById.set('menu-1', new Menu('m', 'g', 'l', '/r', 0, null, null, 'menu-1'));

        await assert.rejects(
            makeHandler(state).execute(new ReplaceMenuPermissionsCommand(
                new ReplaceMenuPermissionsCommand.Input('menu-1', ['nope']),
            )),
            (error: unknown) => error instanceof BadRequestException
                && (error.getResponse() as {code: string}).code === 'ADMIN_PERMISSION_NOT_FOUND',
        );
        assert.equal(state.replaceCalls.length, 0);
    });
});
