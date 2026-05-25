import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {BadRequestException, ConflictException} from '@nestjs/common';
import {MenuRepository} from '../../../../../packages/core/auth/domain';
import {CreateMenuCommand, CreateMenuHandler} from '../../../../../packages/core/auth/domain/command';
import {Menu} from '../../../../../packages/core/auth/domain/model';

interface State {
    menusByKey: Map<string, Menu>;
    menusById:  Map<string, Menu>;
    saved:      Menu[];
}

function freshState(): State {
    return {menusByKey: new Map(), menusById: new Map(), saved: []};
}

function makeHandler(state: State): CreateMenuHandler {
    const repo = {
        async findByMenuKey(key: string): Promise<Menu | null> {
            return state.menusByKey.get(key) ?? null;
        },
        async findById(id: string): Promise<Menu | null> {
            return state.menusById.get(id) ?? null;
        },
        async save(menu: Menu): Promise<Menu> {
            menu.id = `menu-${state.saved.length + 1}`;
            state.saved.push(menu);
            state.menusByKey.set(menu.menuKey, menu);
            state.menusById.set(menu.id, menu);
            return menu;
        },
    } as unknown as MenuRepository;

    return new CreateMenuHandler(repo);
}

describe('CreateMenuHandler', () => {

    it('creates a menu with defaults applied', async () => {

        const state = freshState();
        const output = await makeHandler(state).execute(new CreateMenuCommand(
            new CreateMenuCommand.Input('reports', 'Audit', 'Reports', '/views/reports'),
        ));

        assert.equal(state.saved.length, 1);
        const saved = state.saved[0];
        assert.equal(saved.menuKey, 'reports');
        assert.equal(saved.groupLabel, 'Audit');
        assert.equal(saved.label, 'Reports');
        assert.equal(saved.route, '/views/reports');
        assert.equal(saved.sortOrder, 0);
        assert.equal(saved.icon, null);
        assert.equal(saved.parentId, null);
        assert.equal(saved.isActive, true);
        assert.equal(output.menu.id, 'menu-1');
    });

    it('rejects 409 MENU_KEY_TAKEN on duplicate menuKey', async () => {

        const state = freshState();
        state.menusByKey.set('reports', new Menu('reports', 'Audit', 'X', '/x', 0, null, null, 'existing'));

        await assert.rejects(
            makeHandler(state).execute(new CreateMenuCommand(
                new CreateMenuCommand.Input('reports', 'Audit', 'Y', '/y'),
            )),
            (error: unknown) => error instanceof ConflictException
                && (error.getResponse() as {code: string}).code === 'ADMIN_MENU_KEY_TAKEN',
        );
    });

    it('rejects 400 MENU_PARENT_NOT_FOUND when parentId references a missing menu', async () => {

        const state = freshState();
        await assert.rejects(
            makeHandler(state).execute(new CreateMenuCommand(
                new CreateMenuCommand.Input('child', 'G', 'Child', '/c', null, 10, 'missing-parent'),
            )),
            (error: unknown) => error instanceof BadRequestException
                && (error.getResponse() as {code: string}).code === 'ADMIN_MENU_PARENT_NOT_FOUND',
        );
    });

    it('accepts a valid parentId', async () => {

        const state = freshState();
        const parent = new Menu('parent', 'G', 'Parent', '/p', 0, null, null, 'parent-1');
        state.menusByKey.set('parent', parent);
        state.menusById.set('parent-1', parent);

        const output = await makeHandler(state).execute(new CreateMenuCommand(
            new CreateMenuCommand.Input('child', 'G', 'Child', '/c', null, 10, 'parent-1'),
        ));

        assert.equal(output.menu.parentId, 'parent-1');
    });
});
