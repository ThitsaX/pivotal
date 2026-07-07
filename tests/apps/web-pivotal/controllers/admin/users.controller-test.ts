import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {BadRequestException} from '@nestjs/common';
import {CommandBus} from '@nestjs/cqrs';
import {Participant, ParticipantRepository} from '../../../../../packages/core/participant/domain';
import {AccessTokenClaims, RoleRepository, UserRepository} from '../../../../../packages/core/auth/domain';
import {CreateUserCommand, UpdateUserCommand} from '../../../../../packages/core/auth/domain/command';
import {DFSP_USER_ROLE_CODE, Role, User} from '../../../../../packages/core/auth/domain/model';
import {UsersAdminController} from '../../../../../packages/apps/web-pivotal/controllers/admin/users.controller';

interface State {
    commandInputs: unknown[];
    participantsByName: Map<string, Participant>;
    usersById: Map<string, User>;
}

const dfspRole = new Role(DFSP_USER_ROLE_CODE, 'DFSP Operator', 'DFSP', null, true, 'role-dfsp');

const adminClaims: AccessTokenClaims = {
    sub: 'admin-user',
    role: 'system-administrator',
    fspId: null,
    permissions: [],
    mustChangePassword: false,
    iss: 'pivotal',
    iat: 1,
    exp: 2,
    jti: 'token-1',
};

function makeController(state: State): UsersAdminController {
    return new UsersAdminController(
        {
            async execute(command: CreateUserCommand | UpdateUserCommand): Promise<CreateUserCommand.Output | UpdateUserCommand.Output> {
                state.commandInputs.push(command.input);

                if (command instanceof CreateUserCommand) {
                    const user = new User(command.input.email, 'HASH', dfspRole.id, command.input.fspId, true, 'user-1');
                    return new CreateUserCommand.Output(user, dfspRole, 'TempPass123!');
                }

                const existing = state.usersById.get(command.input.targetUserId)!;
                existing.fspId = command.input.fspId ?? existing.fspId;
                return new UpdateUserCommand.Output(existing, dfspRole);
            },
        } as unknown as CommandBus,
        {
            async findById(id: string): Promise<User | null> {
                return state.usersById.get(id) ?? null;
            },
        } as unknown as UserRepository,
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
            usersById: new Map(),
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
            usersById: new Map(),
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

    it('trims FSP ID before validation and update command dispatch', async () => {

        const target = new User('dfsp@example.com', 'HASH', dfspRole.id, 'wallet1', false, 'user-1');
        const state: State = {
            commandInputs: [],
            participantsByName: new Map([
                ['wallet2', new Participant('wallet2', null, null, 'PUBLIC_KEY', 'participant-2')],
            ]),
            usersById: new Map([['user-1', target]]),
        };

        await makeController(state).update(
            'user-1',
            {fspId: '  wallet2  '},
            adminClaims,
        );

        assert.equal((state.commandInputs[0] as UpdateUserCommand.Input).fspId, 'wallet2');
    });
});
