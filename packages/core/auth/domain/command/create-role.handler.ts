import {ConflictException, Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {DbTarget} from '@shared/typeorm';
import {adminError, AdminErrorCode} from '../error';
import {Role} from '../model';
import {RoleRepository} from '../repository';
import {CreateRoleCommand} from './create-role.command';

@CommandHandler(CreateRoleCommand)
export class CreateRoleHandler implements ICommandHandler<CreateRoleCommand, CreateRoleCommand.Output> {

    constructor(
        @Inject(RoleRepository)
        private readonly roleRepository: RoleRepository,
    ) {
    }

    async execute(command: CreateRoleCommand): Promise<CreateRoleCommand.Output> {

        const {code, name, description} = command.input;

        const existing = await this.roleRepository.findByCode(code, DbTarget.Write);

        if (existing != null) {
            throw new ConflictException(adminError(AdminErrorCode.ROLE_CODE_TAKEN));
        }

        const role = new Role(code, name, description, false);
        const saved = await this.roleRepository.save(role);

        return new CreateRoleCommand.Output(saved);
    }
}
