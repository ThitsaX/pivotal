import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {BadRequestException, NotFoundException} from '@nestjs/common';
import {MenuRepository} from '../../../../../packages/core/auth/domain';
import {UpdateMenuCommand, UpdateMenuHandler} from '../../../../../packages/core/auth/domain/command';
import {Menu} from '../../../../../packages/core/auth/domain/model';

interface State {
    menusById:   Map<string, Menu>;
    updateCalls: Array<{id: string; partial: Record<string, unknown>}>;
}

function freshState(): State {
    return {menusById: new Map(), updateCalls: []};
}

function makeHandler(state: State): UpdateMenuHandler {
    const repo = {
        async findById(id: string): Promise<Menu | null> {
            return state.menusById.get(id) ?? null;
        },
        async update(id: string, partial: Record<string, unknown>): Promise<void> {
            state.updateCalls.push({id, partial});
            const m = state.menusById.get(id);
            if (m != null) Object.assign(m, partial);
        },
    } as unknown as MenuRepository;

    return new UpdateMenuHandler(repo);
}

describe('UpdateMenuHandler', () => {

    it('updates label / route / icon / sortOrder / isActive', async () => {

        const state = freshState();
        state.menusById.set('menu-1', new Menu('reports', 'Audit', 'Old', '/old', 10, null, null, 'menu-1'));

        await makeHandler(state).execute(new UpdateMenuCommand(
            new UpdateMenuCommand.Input('menu-1', 'Audit', 'New', '/new', 'chart', 20, undefined, false),
        ));

        assert.deepEqual(state.updateCalls[0].partial, {
            groupLabel: 'Audit',
            label:      'New',
            route:      '/new',
            icon:       'chart',
            sortOrder:  20,
            isActive:   false,
        });
    });

    it('skips the DB update when nothing changes', async () => {

        const state = freshState();
        state.menusById.set('menu-1', new Menu('reports', 'Audit', 'X', '/x', 0, null, null, 'menu-1'));

        await makeHandler(state).execute(new UpdateMenuCommand(
            new UpdateMenuCommand.Input('menu-1'),
        ));

        assert.equal(state.updateCalls.length, 0);
    });

    it('rejects 404 when the menu does not exist', async () => {

        const state = freshState();
        await assert.rejects(
            makeHandler(state).execute(new UpdateMenuCommand(
                new UpdateMenuCommand.Input('missing', undefined, 'X'),
            )),
            (error: unknown) => error instanceof NotFoundException
                && (error.getResponse() as {code: string}).code === 'ADMIN_MENU_NOT_FOUND',
        );
    });

    it('rejects MENU_PARENT_NOT_FOUND when parentId points at a missing menu', async () => {

        const state = freshState();
        state.menusById.set('menu-1', new Menu('m', 'G', 'M', '/m', 0, null, null, 'menu-1'));

        await assert.rejects(
            makeHandler(state).execute(new UpdateMenuCommand(
                new UpdateMenuCommand.Input('menu-1', undefined, undefined, undefined, undefined, undefined, 'missing-parent'),
            )),
            (error: unknown) => error instanceof BadRequestException
                && (error.getResponse() as {code: string}).code === 'ADMIN_MENU_PARENT_NOT_FOUND',
        );
    });

    it('rejects MENU_PARENT_NOT_FOUND when parentId equals the menu being updated (self-parent)', async () => {

        const state = freshState();
        state.menusById.set('menu-1', new Menu('m', 'G', 'M', '/m', 0, null, null, 'menu-1'));

        await assert.rejects(
            makeHandler(state).execute(new UpdateMenuCommand(
                new UpdateMenuCommand.Input('menu-1', undefined, undefined, undefined, undefined, undefined, 'menu-1'),
            )),
            (error: unknown) => error instanceof BadRequestException
                && (error.getResponse() as {code: string}).code === 'ADMIN_MENU_PARENT_NOT_FOUND',
        );
    });

    it('allows clearing parentId by passing null', async () => {

        const state = freshState();
        const m = new Menu('m', 'G', 'M', '/m', 0, null, 'parent-1', 'menu-1');
        state.menusById.set('menu-1', m);

        await makeHandler(state).execute(new UpdateMenuCommand(
            new UpdateMenuCommand.Input('menu-1', undefined, undefined, undefined, undefined, undefined, null),
        ));

        assert.equal(state.updateCalls[0].partial.parentId, null);
    });
});
