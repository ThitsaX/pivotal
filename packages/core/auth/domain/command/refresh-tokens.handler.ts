// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {Inject, Logger, UnauthorizedException} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {DbTarget} from '@shared/typeorm';
import {authError, AuthErrorCode} from '../error';
import {RefreshToken} from '../model';
import {RefreshTokenRepository, RolePermissionRepository, RoleRepository, UserRepository} from '../repository';
import {TokenService} from '../service';
import {RefreshTokensCommand} from './refresh-tokens.command';

@CommandHandler(RefreshTokensCommand)
export class RefreshTokensHandler
    implements ICommandHandler<RefreshTokensCommand, RefreshTokensCommand.Output> {

    private static readonly LOGGER = new Logger(RefreshTokensHandler.name);

    constructor(
        @Inject(RefreshTokenRepository)
        private readonly refreshTokenRepository: RefreshTokenRepository,
        @Inject(UserRepository)
        private readonly userRepository: UserRepository,
        @Inject(RoleRepository)
        private readonly roleRepository: RoleRepository,
        @Inject(RolePermissionRepository)
        private readonly rolePermissionRepository: RolePermissionRepository,
        @Inject(TokenService)
        private readonly tokenService: TokenService,
    ) {
    }

    async execute(command: RefreshTokensCommand): Promise<RefreshTokensCommand.Output> {

        const tokenHash = TokenService.hashRefreshToken(command.input.refreshToken);

        const existing = await this.refreshTokenRepository.findByTokenHash(tokenHash, DbTarget.Write);

        if (existing == null) {
            throw new UnauthorizedException(authError(AuthErrorCode.INVALID_REFRESH_TOKEN));
        }

        const now = new Date();

        if (existing.revokedAt != null) {
            // Reuse of a previously-rotated token => assume theft, revoke the whole family.
            RefreshTokensHandler.LOGGER.warn(
                `Reuse of revoked refresh token detected for user ${existing.userId}; revoking family ${existing.familyId}.`,
            );
            await this.refreshTokenRepository.revokeFamily(existing.familyId);
            throw new UnauthorizedException(authError(AuthErrorCode.REFRESH_TOKEN_REUSE));
        }

        if (existing.expiresAt <= now) {
            await this.refreshTokenRepository.markRevoked(existing.id);
            throw new UnauthorizedException(authError(AuthErrorCode.INVALID_REFRESH_TOKEN));
        }

        const user = await this.userRepository.findById(existing.userId, DbTarget.Write);

        if (user == null || !user.isActive) {
            await this.refreshTokenRepository.revokeFamily(existing.familyId);
            throw new UnauthorizedException(authError(AuthErrorCode.INVALID_REFRESH_TOKEN));
        }

        const role = await this.roleRepository.findById(user.roleId, DbTarget.Write);

        if (role == null) {
            RefreshTokensHandler.LOGGER.error(`User ${user.id} references unknown role_id=${user.roleId}.`);
            throw new UnauthorizedException(authError(AuthErrorCode.UNKNOWN_ROLE));
        }

        // Issue the new access + refresh tokens in the same family
        const issued = this.tokenService.issueRefreshToken();
        const newRefreshToken = new RefreshToken(
            user.id,
            existing.familyId,
            issued.hash,
            issued.expiresAt,
        );
        const savedNew = await this.refreshTokenRepository.save(newRefreshToken);

        // Revoke the old token and link it to its replacement (forensic trail)
        await this.refreshTokenRepository.markRevoked(existing.id, savedNew.id);

        const permissions = await this.rolePermissionRepository.findPermissionKeysByRoleId(role.id, DbTarget.Write);

        const accessToken = await this.tokenService.signAccessToken({
            userId:             user.id,
            roleCode:           role.code,
            fspId:              user.fspId,
            mustChangePassword: user.mustChangePassword,
            permissions,
        });

        return new RefreshTokensCommand.Output(
            accessToken,
            issued.plaintext,
            issued.expiresAt,
            permissions,
            user.mustChangePassword,
        );
    }
}
