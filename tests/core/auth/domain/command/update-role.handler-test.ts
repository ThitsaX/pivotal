import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {BadRequestException, ConflictException, NotFoundException} from '@nestjs/common';
import {RoleRepository} from '../../../../../packages/core/auth/domain';
import {UpdateRoleCommand, UpdateRoleHandler} from '../../../../../packages/core/auth/domain/command';
import {Role} from '../../../../../packages/core/auth/domain/model';

interface State {
    rolesById:   Map<string, Role>;
    rolesByName: Map<string, Role>;
    updateCalls: Array<{id: string; partial: Record<string, unknown>}>;
}

function freshState(): State {
    return {rolesById: new Map(), rolesByName: new Map(), updateCalls: []};
}

function makeHandler(state: State): UpdateRoleHandler {
    const repo = {
        async findById(id: string): Promise<Role | null> {
            return state.rolesById.get(id) ?? null;
        },
        async findByName(name: string): Promise<Role | null> {
            return state.rolesByName.get(name) ?? null;
        },
        async update(id: string, partial: Record<string, unknown>): Promise<void> {
            state.updateCalls.push({id, partial});
            const r = state.rolesById.get(id);
            if (r != null) {
                Object.assign(r, partial);
            }
        },
    } as unknown as RoleRepository;

    return new UpdateRoleHandler(repo);
}

describe('UpdateRoleHandler', () => {

    it('updates name and description', async () => {

        const state = freshState();
        state.rolesById.set('role-1', new Role('OPS', 'Old', 'HUB', 'Old desc', false, 'role-1'));

        await makeHandler(state).execute(new UpdateRoleCommand(
            new UpdateRoleCommand.Input('role-1', '  New name  ', 'New desc'),
        ));

        assert.deepEqual(state.updateCalls[0].partial, {name: 'New name', description: 'New desc'});
    });

    it('rejects blank display names', async () => {

        const state = freshState();
        state.rolesById.set('role-1', new Role('OPS', 'Old', 'HUB', null, false, 'role-1'));

        await assert.rejects(
            makeHandler(state).execute(new UpdateRoleCommand(
                new UpdateRoleCommand.Input('role-1', '   ', undefined),
            )),
            (error: unknown) => error instanceof BadRequestException
                && (error.getResponse() as {code: string}).code === 'ADMIN_ROLE_NAME_REQUIRED',
        );

        assert.equal(state.updateCalls.length, 0);
    });

    it('rejects duplicate display names', async () => {

        const state = freshState();
        state.rolesById.set('role-1', new Role('OPS', 'Operator', 'HUB', null, false, 'role-1'));
        state.rolesByName.set('Auditor', new Role('AUDITOR', 'Auditor', 'HUB', null, false, 'role-2'));

        await assert.rejects(
            makeHandler(state).execute(new UpdateRoleCommand(
                new UpdateRoleCommand.Input('role-1', 'Auditor', undefined),
            )),
            (error: unknown) => error instanceof ConflictException
                && (error.getResponse() as {code: string}).code === 'ADMIN_ROLE_NAME_TAKEN',
        );

        assert.equal(state.updateCalls.length, 0);
    });

    it('skips the DB update when nothing changes', async () => {

        const state = freshState();
        state.rolesById.set('role-1', new Role('OPS', 'Old', 'HUB', 'Old desc', false, 'role-1'));

        await makeHandler(state).execute(new UpdateRoleCommand(
            new UpdateRoleCommand.Input('role-1', undefined, undefined),
        ));

        assert.equal(state.updateCalls.length, 0);
    });

    it('rejects 404 when the role does not exist', async () => {

        const state = freshState();

        await assert.rejects(
            makeHandler(state).execute(new UpdateRoleCommand(
                new UpdateRoleCommand.Input('missing', 'X', null),
            )),
            (error: unknown) => error instanceof NotFoundException
                && (error.getResponse() as {code: string}).code === 'ADMIN_ROLE_NOT_FOUND',
        );
    });
});
