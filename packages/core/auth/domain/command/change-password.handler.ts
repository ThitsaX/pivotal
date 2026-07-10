// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {BadRequestException, Inject, UnauthorizedException} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {DbTarget} from '@shared/typeorm';
import {authError, AuthErrorCode} from '../error';
import {RefreshTokenRepository, UserRepository} from '../repository';
import {PasswordService} from '../service';
import {ChangePasswordCommand} from './change-password.command';

@CommandHandler(ChangePasswordCommand)
export class ChangePasswordHandler
    implements ICommandHandler<ChangePasswordCommand, ChangePasswordCommand.Output> {

    constructor(
        @Inject(UserRepository)
        private readonly userRepository: UserRepository,
        @Inject(RefreshTokenRepository)
        private readonly refreshTokenRepository: RefreshTokenRepository,
        @Inject(PasswordService)
        private readonly passwordService: PasswordService,
    ) {
    }

    async execute(command: ChangePasswordCommand): Promise<ChangePasswordCommand.Output> {

        const {userId, currentPassword, newPassword} = command.input;

        const user = await this.userRepository.findById(userId, DbTarget.Write);

        if (user == null || !user.isActive) {
            throw new UnauthorizedException(authError(AuthErrorCode.INVALID_CREDENTIALS));
        }

        const currentValid = await this.passwordService.verify(currentPassword, user.passwordHash);

        if (!currentValid) {
            throw new UnauthorizedException(authError(AuthErrorCode.INVALID_CREDENTIALS));
        }

        const isSamePassword = await this.passwordService.verify(newPassword, user.passwordHash);

        if (isSamePassword) {
            throw new BadRequestException(authError(AuthErrorCode.PASSWORD_SAME_AS_CURRENT));
        }

        const newHash = await this.passwordService.hash(newPassword);
        await this.userRepository.updatePasswordHash(user.id, newHash, false);

        // Security-paranoid: revoke all existing sessions on password change.
        await this.refreshTokenRepository.revokeAllForUser(user.id);
        await this.userRepository.invalidateTokens(user.id);

        return new ChangePasswordCommand.Output(true);
    }
}
