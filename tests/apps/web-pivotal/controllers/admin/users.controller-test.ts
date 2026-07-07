import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {BadRequestException} from '@nestjs/common';
import {CommandBus} from '@nestjs/cqrs';
import {Participant, ParticipantRepository} from '../../../../../packages/core/participant/domain';
import {RoleRepository, UserRepository} from '../../../../../packages/core/auth/domain';
import {CreateUserCommand} from '../../../../../packages/core/auth/domain/command';
import {DFSP_USER_ROLE_CODE, Role, User} from '../../../../../packages/core/auth/domain/model';
import {UsersAdminController} from '../../../../../packages/apps/web-pivotal/controllers/admin/users.controller';

interface State {
    commandInputs: unknown[];
    participantsByName: Map<string, Participant>;
}

const dfspRole = new Role(DFSP_USER_ROLE_CODE, 'DFSP Operator', 'DFSP', null, true, 'role-dfsp');

function makeController(state: State): UsersAdminController {
    return new UsersAdminController(
        {
            async execute(command: CreateUserCommand): Promise<CreateUserCommand.Output> {
                state.commandInputs.push(command.input);
                const user = new User(command.input.email, 'HASH', dfspRole.id, command.input.fspId, true, 'user-1');
                return new CreateUserCommand.Output(user, dfspRole, 'TempPass123!');
            },
        } as unknown as CommandBus,
        {} as UserRepository,
        {
            async findById(id: string): Promise<Role | null> {
                return id === dfspRole.id ? dfspRole : null;
            },
        } as unknown as RoleRepository,
        {
            async findByName(name: string): Promise<Participant | null> {
                return state.participantsByName.get(name) ?? null;
            },
        } as unknown as ParticipantRepository,
    );
}

describe('UsersAdminController', () => {

    it('trims FSP ID before validation and create command dispatch', async () => {

        const state: State = {
            commandInputs: [],
            participantsByName: new Map([
                ['wallet1', new Participant('wallet1', null, null, 'PUBLIC_KEY', 'participant-1')],
            ]),
        };

        await makeController(state).create({
            email: 'dfsp@example.com',
            roleId: dfspRole.id,
            fspId: '  wallet1  ',
        });

        assert.equal((state.commandInputs[0] as CreateUserCommand.Input).fspId, 'wallet1');
    });

    it('rejects a DFSP user when the FSP ID does not exist', async () => {

        const state: State = {
            commandInputs: [],
            participantsByName: new Map(),
        };

        await assert.rejects(
            makeController(state).create({
                email: 'dfsp@example.com',
                roleId: dfspRole.id,
                fspId: 'missing-fsp',
            }),
            (error: unknown) => error instanceof BadRequestException
                && (error.getResponse() as {code: string}).code === 'ADMIN_USER_FSP_ID_NOT_FOUND',
        );

        assert.equal(state.commandInputs.length, 0);
    });
});
