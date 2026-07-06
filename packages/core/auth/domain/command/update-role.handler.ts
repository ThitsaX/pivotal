// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {BadRequestException, ConflictException, Inject, NotFoundException} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {DbTarget} from '@shared/typeorm';
import {adminError, AdminErrorCode} from '../error';
import {RoleRepository, RoleUpdate} from '../repository';
import {UpdateRoleCommand} from './update-role.command';

@CommandHandler(UpdateRoleCommand)
export class UpdateRoleHandler implements ICommandHandler<UpdateRoleCommand, UpdateRoleCommand.Output> {

    constructor(
        @Inject(RoleRepository)
        private readonly roleRepository: RoleRepository,
    ) {
    }

    async execute(command: UpdateRoleCommand): Promise<UpdateRoleCommand.Output> {

        const {roleId, name, description} = command.input;

        const role = await this.roleRepository.findById(roleId, DbTarget.Write);

        if (role == null) {
            throw new NotFoundException(adminError(AdminErrorCode.ROLE_NOT_FOUND));
        }

        const patch: RoleUpdate = {};

        if (name !== undefined) {
            const normalizedName = name.trim();

            if (normalizedName.length === 0) {
                throw new BadRequestException(adminError(AdminErrorCode.ROLE_NAME_REQUIRED));
            }

            const existingName = await this.roleRepository.findByName(normalizedName, DbTarget.Write);

            if (existingName != null && existingName.id !== role.id) {
                throw new ConflictException(adminError(AdminErrorCode.ROLE_NAME_TAKEN));
            }

            patch.name = normalizedName;
        }

        if (description !== undefined) {
            patch.description = description;
        }

        if (Object.keys(patch).length > 0) {
            await this.roleRepository.update(role.id, patch);
        }

        const refreshed = (await this.roleRepository.findById(role.id, DbTarget.Write))!;

        return new UpdateRoleCommand.Output(refreshed);
    }
}
