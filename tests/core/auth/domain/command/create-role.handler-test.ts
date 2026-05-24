import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {ConflictException} from '@nestjs/common';
import {RoleRepository} from '../../../../../packages/core/auth/domain';
import {CreateRoleCommand, CreateRoleHandler} from '../../../../../packages/core/auth/domain/command';
import {Role} from '../../../../../packages/core/auth/domain/model';

interface State {
    rolesByCode: Map<string, Role>;
    saved:       Role[];
}

function freshState(): State {
    return {rolesByCode: new Map(), saved: []};
}

function makeHandler(state: State): CreateRoleHandler {
    const repo = {
        async findByCode(code: string): Promise<Role | null> {
            return state.rolesByCode.get(code) ?? null;
        },
        async save(role: Role): Promise<Role> {
            role.id = `role-${state.saved.length + 1}`;
            state.saved.push(role);
            state.rolesByCode.set(role.code, role);
            return role;
        },
    } as unknown as RoleRepository;

    return new CreateRoleHandler(repo);
}

describe('CreateRoleHandler', () => {

    it('creates a non-system role with the given fields', async () => {

        const state = freshState();
        const output = await makeHandler(state).execute(new CreateRoleCommand(
            new CreateRoleCommand.Input('AUDITOR', 'Auditor', 'Read-only review'),
        ));

        assert.equal(state.saved.length, 1);
        assert.equal(state.saved[0].code, 'AUDITOR');
        assert.equal(state.saved[0].name, 'Auditor');
        assert.equal(state.saved[0].description, 'Read-only review');
        assert.equal(state.saved[0].isSystem, false);
        assert.equal(output.role.id, 'role-1');
    });

    it('accepts a null description', async () => {

        const state = freshState();
        const output = await makeHandler(state).execute(new CreateRoleCommand(
            new CreateRoleCommand.Input('OPS', 'Operator', null),
        ));

        assert.equal(output.role.description, null);
    });

    it('rejects 409 ROLE_CODE_TAKEN when the code already exists', async () => {

        const state = freshState();
        state.rolesByCode.set('AUDITOR', new Role('AUDITOR', 'Existing', null, false, 'role-existing'));

        await assert.rejects(
            makeHandler(state).execute(new CreateRoleCommand(
                new CreateRoleCommand.Input('AUDITOR', 'New', null),
            )),
            (error: unknown) => error instanceof ConflictException
                && (error.getResponse() as {code: string}).code === 'ADMIN_ROLE_CODE_TAKEN',
        );
    });
});
