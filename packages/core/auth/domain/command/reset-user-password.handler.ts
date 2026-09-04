// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Inject, NotFoundException} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {DbTarget} from '@shared/typeorm';
import {adminError, AdminErrorCode} from '../error';
import {RoleRepository, UserRepository} from '../repository';
import {RefreshTokenRepository} from '../repository/refresh-token.repository';
import {PasswordService, TempPasswordService, UserManagementPolicy} from '../service';
import {ResetUserPasswordCommand} from './reset-user-password.command';

@CommandHandler(ResetUserPasswordCommand)
export class ResetUserPasswordHandler
    implements ICommandHandler<ResetUserPasswordCommand, ResetUserPasswordCommand.Output> {

    constructor(
        @Inject(UserRepository)
        private readonly userRepository: UserRepository,
        @Inject(RoleRepository)
        private readonly roleRepository: RoleRepository,
        @Inject(RefreshTokenRepository)
        private readonly refreshTokenRepository: RefreshTokenRepository,
        @Inject(PasswordService)
        private readonly passwordService: PasswordService,
        @Inject(TempPasswordService)
        private readonly tempPasswordService: TempPasswordService,
        @Inject(UserManagementPolicy)
        private readonly userManagementPolicy: UserManagementPolicy,
    ) {
    }

    async execute(command: ResetUserPasswordCommand): Promise<ResetUserPasswordCommand.Output> {

        const {targetUserId, actingUserId} = command.input;
        const context = await this.userManagementPolicy.resolveManagementContext(actingUserId);

        const user = await this.userRepository.findById(targetUserId, DbTarget.Write);

        if (user == null) {
            throw new NotFoundException(adminError(AdminErrorCode.USER_NOT_FOUND));
        }

        this.userManagementPolicy.assertCanManageTarget(context, user);

        const role = (await this.roleRepository.findById(user.roleId, DbTarget.Write))!;

        const tempPassword = this.tempPasswordService.generate();
        const passwordHash = await this.passwordService.hash(tempPassword);

        await this.userRepository.updatePasswordHash(user.id, passwordHash, true);
        await this.refreshTokenRepository.revokeAllForUser(user.id);
        await this.userRepository.invalidateTokens(user.id);

        const refreshed = (await this.userRepository.findById(user.id, DbTarget.Write))!;

        return new ResetUserPasswordCommand.Output(refreshed, role, tempPassword);
    }
}