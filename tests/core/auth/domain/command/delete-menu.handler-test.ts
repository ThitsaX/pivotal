import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {NotFoundException} from '@nestjs/common';
import {MenuRepository} from '../../../../../packages/core/auth/domain';
import {DeleteMenuCommand, DeleteMenuHandler} from '../../../../../packages/core/auth/domain/command';
import {Menu} from '../../../../../packages/core/auth/domain/model';

interface State {
    menusById: Map<string, Menu>;
    deleted:   string[];
}

function freshState(): State {
    return {menusById: new Map(), deleted: []};
}

function makeHandler(state: State): DeleteMenuHandler {
    const repo = {
        async findById(id: string): Promise<Menu | null> {
            return state.menusById.get(id) ?? null;
        },
        async delete(id: string): Promise<void> {
            state.deleted.push(id);
            state.menusById.delete(id);
        },
    } as unknown as MenuRepository;

    return new DeleteMenuHandler(repo);
}

describe('DeleteMenuHandler', () => {

    it('deletes a custom menu without warning', async () => {

        const state = freshState();
        state.menusById.set('menu-1', new Menu('custom-key', 'Audit', 'Custom', '/c', 0, null, null, 'menu-1'));

        const output = await makeHandler(state).execute(
            new DeleteMenuCommand(new DeleteMenuCommand.Input('menu-1')),
        );

        assert.deepEqual(state.deleted, ['menu-1']);
        assert.equal(output.deleted, true);
    });

    it('still deletes a seeded menu (logged warning is non-blocking; AC-11.4)', async () => {

        const state = freshState();
        state.menusById.set('menu-1', new Menu('admin-users', 'Admin', 'Users', '/admin-users', 10, null, null, 'menu-1'));

        await makeHandler(state).execute(new DeleteMenuCommand(new DeleteMenuCommand.Input('menu-1')));

        assert.deepEqual(state.deleted, ['menu-1']);
    });

    it('rejects 404 when the menu does not exist', async () => {

        const state = freshState();
        await assert.rejects(
            makeHandler(state).execute(new DeleteMenuCommand(new DeleteMenuCommand.Input('missing'))),
            (error: unknown) => error instanceof NotFoundException
                && (error.getResponse() as {code: string}).code === 'ADMIN_MENU_NOT_FOUND',
        );
    });
});
