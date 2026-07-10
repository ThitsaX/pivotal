// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {ConflictException, Inject, NotFoundException} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {DbTarget} from '@shared/typeorm';
import {adminError, AdminErrorCode} from '../error';
import {RoleRepository, UserRepository} from '../repository';
import {DeleteRoleCommand} from './delete-role.command';

@CommandHandler(DeleteRoleCommand)
export class DeleteRoleHandler implements ICommandHandler<DeleteRoleCommand, DeleteRoleCommand.Output> {

    constructor(
        @Inject(RoleRepository)
        private readonly roleRepository: RoleRepository,
        @Inject(UserRepository)
        private readonly userRepository: UserRepository,
    ) {
    }

    async execute(command: DeleteRoleCommand): Promise<DeleteRoleCommand.Output> {

        const {roleId} = command.input;

        const role = await this.roleRepository.findById(roleId, DbTarget.Write);

        if (role == null) {
            throw new NotFoundException(adminError(AdminErrorCode.ROLE_NOT_FOUND));
        }

        if (role.isSystem) {
            throw new ConflictException(adminError(AdminErrorCode.ROLE_IS_SYSTEM));
        }

        const inUse = await this.userRepository.countByRoleId(role.id, DbTarget.Write);

        if (inUse > 0) {
            throw new ConflictException(adminError(AdminErrorCode.ROLE_IN_USE));
        }

        await this.roleRepository.delete(role.id);

        return new DeleteRoleCommand.Output(true);
    }
}
