// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {BadRequestException, ConflictException, Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {DbTarget} from '@shared/typeorm';
import {adminError, AdminErrorCode} from '../error';
import {User} from '../model';
import {RoleRepository, UserRepository} from '../repository';
import {PasswordService, TempPasswordService} from '../service';
import {CreateUserCommand} from './create-user.command';

@CommandHandler(CreateUserCommand)
export class CreateUserHandler implements ICommandHandler<CreateUserCommand, CreateUserCommand.Output> {

    constructor(
        @Inject(UserRepository)
        private readonly userRepository: UserRepository,
        @Inject(RoleRepository)
        private readonly roleRepository: RoleRepository,
        @Inject(PasswordService)
        private readonly passwordService: PasswordService,
        @Inject(TempPasswordService)
        private readonly tempPasswordService: TempPasswordService,
    ) {
    }

    async execute(command: CreateUserCommand): Promise<CreateUserCommand.Output> {

        const {email, roleId, fspId} = command.input;

        const role = await this.roleRepository.findById(roleId, DbTarget.Write);

        if (role == null) {
            throw new BadRequestException(adminError(AdminErrorCode.USER_ROLE_NOT_FOUND));
        }

        const normalizedFspId = fspId != null && fspId.trim().length > 0 ? fspId.trim() : null;

        if (role.scope === 'HUB' && normalizedFspId != null) {
            throw new BadRequestException(adminError(AdminErrorCode.USER_ADMIN_FORBIDS_FSP_ID));
        }

        if (role.scope === 'DFSP' && normalizedFspId == null) {
            throw new BadRequestException(adminError(AdminErrorCode.USER_DFSP_REQUIRES_FSP_ID));
        }

        const existing = await this.userRepository.findByEmail(email, DbTarget.Write);

        if (existing != null) {
            throw new ConflictException(adminError(AdminErrorCode.USER_EMAIL_TAKEN));
        }

        const tempPassword = this.tempPasswordService.generate();
        const passwordHash = await this.passwordService.hash(tempPassword);

        const user = new User(email, passwordHash, role.id, normalizedFspId, true);
        const saved = await this.userRepository.save(user);

        return new CreateUserCommand.Output(saved, role, tempPassword);
    }
}
