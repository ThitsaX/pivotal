import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {ConflictException, NotFoundException} from '@nestjs/common';
import {RoleRepository, UserRepository} from '../../../../../packages/core/auth/domain';
import {DeleteRoleCommand, DeleteRoleHandler} from '../../../../../packages/core/auth/domain/command';
import {Role} from '../../../../../packages/core/auth/domain/model';

interface State {
    rolesById:    Map<string, Role>;
    userCountByRole: Map<string, number>;
    deleted:      string[];
}

function freshState(): State {
    return {rolesById: new Map(), userCountByRole: new Map(), deleted: []};
}

function makeHandler(state: State): DeleteRoleHandler {
    const roleRepo = {
        async findById(id: string): Promise<Role | null> {
            return state.rolesById.get(id) ?? null;
        },
        async delete(id: string): Promise<void> {
            state.deleted.push(id);
            state.rolesById.delete(id);
        },
    } as unknown as RoleRepository;

    const userRepo = {
        async countByRoleId(roleId: string): Promise<number> {
            return state.userCountByRole.get(roleId) ?? 0;
        },
    } as unknown as UserRepository;

    return new DeleteRoleHandler(roleRepo, userRepo);
}

describe('DeleteRoleHandler', () => {

    it('hard-deletes a non-system role with no users', async () => {

        const state = freshState();
        state.rolesById.set('role-1', new Role('OPS', 'Ops', null, false, 'role-1'));

        await makeHandler(state).execute(new DeleteRoleCommand(new DeleteRoleCommand.Input('role-1')));

        assert.deepEqual(state.deleted, ['role-1']);
    });

    it('rejects 404 when the role does not exist', async () => {

        const state = freshState();
        await assert.rejects(
            makeHandler(state).execute(new DeleteRoleCommand(new DeleteRoleCommand.Input('missing'))),
            (error: unknown) => error instanceof NotFoundException
                && (error.getResponse() as {code: string}).code === 'ADMIN_ROLE_NOT_FOUND',
        );
    });

    it('rejects 409 ROLE_IS_SYSTEM for a system role', async () => {

        const state = freshState();
        state.rolesById.set('role-admin', new Role('ADMIN', 'Admin', null, true, 'role-admin'));

        await assert.rejects(
            makeHandler(state).execute(new DeleteRoleCommand(new DeleteRoleCommand.Input('role-admin'))),
            (error: unknown) => error instanceof ConflictException
                && (error.getResponse() as {code: string}).code === 'ADMIN_ROLE_IS_SYSTEM',
        );
        assert.equal(state.deleted.length, 0);
    });

    it('rejects 409 ROLE_IN_USE when users still hold the role', async () => {

        const state = freshState();
        state.rolesById.set('role-1', new Role('OPS', 'Ops', null, false, 'role-1'));
        state.userCountByRole.set('role-1', 3);

        await assert.rejects(
            makeHandler(state).execute(new DeleteRoleCommand(new DeleteRoleCommand.Input('role-1'))),
            (error: unknown) => error instanceof ConflictException
                && (error.getResponse() as {code: string}).code === 'ADMIN_ROLE_IN_USE',
        );
        assert.equal(state.deleted.length, 0);
    });
});
