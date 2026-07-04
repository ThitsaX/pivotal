// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {DbTarget} from '@shared/typeorm';
import {RefreshTokenRepository} from '../repository';
import {TokenService} from '../service';
import {LogoutCommand} from './logout.command';

@CommandHandler(LogoutCommand)
export class LogoutHandler implements ICommandHandler<LogoutCommand, LogoutCommand.Output> {

    constructor(
        @Inject(RefreshTokenRepository)
        private readonly refreshTokenRepository: RefreshTokenRepository,
    ) {
    }

    async execute(command: LogoutCommand): Promise<LogoutCommand.Output> {

        const {refreshToken, allDevices} = command.input;

        const tokenHash = TokenService.hashRefreshToken(refreshToken);
        const existing = await this.refreshTokenRepository.findByTokenHash(tokenHash, DbTarget.Write);

        if (existing == null) {
            // Treat as a no-op: caller already has no valid session.
            return new LogoutCommand.Output(false);
        }

        if (allDevices) {
            await this.refreshTokenRepository.revokeAllForUser(existing.userId);
        } else if (existing.revokedAt == null) {
            await this.refreshTokenRepository.markRevoked(existing.id);
        }

        return new LogoutCommand.Output(true);
    }
}
