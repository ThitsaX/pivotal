import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {BadRequestException, ConflictException} from '@nestjs/common';
import {RoleRepository, UserRepository} from '../../../../../packages/core/auth/domain';
import {CreateUserCommand, CreateUserHandler} from '../../../../../packages/core/auth/domain/command';
import {ADMIN_ROLE_CODE, DFSP_USER_ROLE_CODE, Role, User} from '../../../../../packages/core/auth/domain/model';
import {PasswordService, TempPasswordService} from '../../../../../packages/core/auth/domain/service';

interface State {
    rolesById:    Map<string, Role>;
    usersByEmail: Map<string, User>;
    saved:        User[];
}

function freshState(): State {
    const adminRole = new Role(ADMIN_ROLE_CODE, 'System Administrator', null, true, 'role-admin');
    const dfspRole = new Role(DFSP_USER_ROLE_CODE, 'DFSP Operator', null, true, 'role-dfsp');
    return {
        rolesById:    new Map([[adminRole.id, adminRole], [dfspRole.id, dfspRole]]),
        usersByEmail: new Map(),
        saved:        [],
    };
}

function makeUserRepo(state: State): UserRepository {
    return {
        async findByEmail(email: string): Promise<User | null> {
            return state.usersByEmail.get(email) ?? null;
        },
        async save(user: User): Promise<User> {
            user.id = `user-${state.saved.length + 1}`;
            state.saved.push(user);
            state.usersByEmail.set(user.email, user);
            return user;
        },
    } as unknown as UserRepository;
}

function makeRoleRepo(state: State): RoleRepository {
    return {
        async findById(id: string): Promise<Role | null> {
            return state.rolesById.get(id) ?? null;
        },
    } as unknown as RoleRepository;
}

function makePasswordService(): PasswordService {
    return {
        async hash(plain: string): Promise<string> {
            return `HASH(${plain})`;
        },
    } as unknown as PasswordService;
}

function makeTempPasswordService(): TempPasswordService {
    return {
        generate(): string {
            return 'Temp-Pass-1234!';
        },
    } as unknown as TempPasswordService;
}

function makeHandler(state: State): CreateUserHandler {
    return new CreateUserHandler(
        makeUserRepo(state),
        makeRoleRepo(state),
        makePasswordService(),
        makeTempPasswordService(),
    );
}

describe('CreateUserHandler', () => {

    it('creates a DFSP_USER with the generated temp password and mustChangePassword=true', async () => {

        const state = freshState();
        const output = await makeHandler(state).execute(new CreateUserCommand(
            new CreateUserCommand.Input('dfsp@example.com', 'role-dfsp', 'fsp-001'),
        ));

        assert.equal(state.saved.length, 1);
        const saved = state.saved[0];
        assert.equal(saved.email, 'dfsp@example.com');
        assert.equal(saved.roleId, 'role-dfsp');
        assert.equal(saved.fspId, 'fsp-001');
        assert.equal(saved.mustChangePassword, true);
        assert.equal(saved.isActive, true);
        assert.equal(saved.passwordHash, 'HASH(Temp-Pass-1234!)');

        assert.equal(output.tempPassword, 'Temp-Pass-1234!');
        assert.equal(output.role.code, DFSP_USER_ROLE_CODE);
    });

    it('creates an ADMIN with no fspId', async () => {

        const state = freshState();
        const output = await makeHandler(state).execute(new CreateUserCommand(
            new CreateUserCommand.Input('admin@example.com', 'role-admin', null),
        ));

        assert.equal(state.saved.length, 1);
        assert.equal(state.saved[0].fspId, null);
        assert.equal(output.role.code, ADMIN_ROLE_CODE);
    });

    it('rejects 400 USER_ROLE_NOT_FOUND when the role does not exist', async () => {

        const state = freshState();
        await assert.rejects(
            makeHandler(state).execute(new CreateUserCommand(
                new CreateUserCommand.Input('x@example.com', 'role-missing', 'fsp-001'),
            )),
            (error: unknown) => error instanceof BadRequestException
                && (error.getResponse() as {code: string}).code === 'ADMIN_USER_ROLE_NOT_FOUND',
        );
    });

    it('rejects 400 USER_DFSP_REQUIRES_FSP_ID for a non-ADMIN role with null fspId', async () => {

        const state = freshState();
        await assert.rejects(
            makeHandler(state).execute(new CreateUserCommand(
                new CreateUserCommand.Input('x@example.com', 'role-dfsp', null),
            )),
            (error: unknown) => error instanceof BadRequestException
                && (error.getResponse() as {code: string}).code === 'ADMIN_USER_DFSP_REQUIRES_FSP_ID',
        );
    });

    it('rejects 400 USER_DFSP_REQUIRES_FSP_ID for a non-ADMIN role with empty/whitespace fspId', async () => {

        const state = freshState();
        await assert.rejects(
            makeHandler(state).execute(new CreateUserCommand(
                new CreateUserCommand.Input('x@example.com', 'role-dfsp', '   '),
            )),
            (error: unknown) => error instanceof BadRequestException
                && (error.getResponse() as {code: string}).code === 'ADMIN_USER_DFSP_REQUIRES_FSP_ID',
        );
    });

    it('rejects 400 USER_ADMIN_FORBIDS_FSP_ID for an ADMIN role with non-null fspId', async () => {

        const state = freshState();
        await assert.rejects(
            makeHandler(state).execute(new CreateUserCommand(
                new CreateUserCommand.Input('x@example.com', 'role-admin', 'fsp-001'),
            )),
            (error: unknown) => error instanceof BadRequestException
                && (error.getResponse() as {code: string}).code === 'ADMIN_USER_ADMIN_FORBIDS_FSP_ID',
        );
    });

    it('rejects 409 USER_EMAIL_TAKEN when the email already exists', async () => {

        const state = freshState();
        state.usersByEmail.set('dup@example.com', new User('dup@example.com', 'HASH', 'role-dfsp', 'fsp-001', false, 'existing'));

        await assert.rejects(
            makeHandler(state).execute(new CreateUserCommand(
                new CreateUserCommand.Input('dup@example.com', 'role-dfsp', 'fsp-001'),
            )),
            (error: unknown) => error instanceof ConflictException
                && (error.getResponse() as {code: string}).code === 'ADMIN_USER_EMAIL_TAKEN',
        );
    });
});
