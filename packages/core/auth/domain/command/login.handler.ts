// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Inject, Logger, UnauthorizedException} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {DbTarget} from '@shared/typeorm';
import {authError, AuthErrorCode} from '../error';
import {RefreshToken} from '../model';
import {RefreshTokenRepository, RolePermissionRepository, RoleRepository, UserRepository} from '../repository';
import {
    AUTH_DOMAIN_REQUIRED_SETTINGS,
    AuthDomainSettings,
    PasswordService,
    TokenService,
} from '../service';
import {LoginCommand} from './login.command';

@CommandHandler(LoginCommand)
export class LoginHandler implements ICommandHandler<LoginCommand, LoginCommand.Output> {

    private static readonly LOGGER = new Logger(LoginHandler.name);

    constructor(
        @Inject(UserRepository)
        private readonly userRepository: UserRepository,
        @Inject(RoleRepository)
        private readonly roleRepository: RoleRepository,
        @Inject(RolePermissionRepository)
        private readonly rolePermissionRepository: RolePermissionRepository,
        @Inject(RefreshTokenRepository)
        private readonly refreshTokenRepository: RefreshTokenRepository,
        @Inject(PasswordService)
        private readonly passwordService: PasswordService,
        @Inject(TokenService)
        private readonly tokenService: TokenService,
        @Inject(AUTH_DOMAIN_REQUIRED_SETTINGS)
        private readonly settings: AuthDomainSettings,
    ) {
    }

    async execute(command: LoginCommand): Promise<LoginCommand.Output> {

        const {email, password} = command.input;

        const user = await this.userRepository.findByEmail(email, DbTarget.Write);

        if (user == null) {
            throw new UnauthorizedException(authError(AuthErrorCode.INVALID_CREDENTIALS));
        }

        if (!user.isActive) {
            throw new UnauthorizedException(authError(AuthErrorCode.USER_INACTIVE));
        }

        const now = new Date();

        if (user.lockedUntil != null && user.lockedUntil > now) {
            LoginHandler.LOGGER.warn(`Login blocked: account locked until ${user.lockedUntil.toISOString()} for user ${user.id}.`);
            throw new UnauthorizedException(this.accountLockedError(this.remainingLockoutMinutes(user.lockedUntil, now)));
        }

        const passwordValid = await this.passwordService.verify(password, user.passwordHash);

        if (!passwordValid) {
            const locked = await this.handleFailedAttempt(user.id, user.failedLoginAttempts + 1);

            if (locked) {
                throw new UnauthorizedException(this.accountLockedError(this.settings.loginLockoutDurationMinutes()));
            }

            throw new UnauthorizedException(authError(AuthErrorCode.INVALID_CREDENTIALS));
        }

        const role = await this.roleRepository.findById(user.roleId, DbTarget.Write);

        if (role == null) {
            LoginHandler.LOGGER.error(`User ${user.id} references unknown role_id=${user.roleId}.`);
            throw new UnauthorizedException(authError(AuthErrorCode.UNKNOWN_ROLE));
        }

        await this.userRepository.recordSuccessfulLogin(user.id);

        const permissions = await this.rolePermissionRepository.findPermissionKeysByRoleId(role.id, DbTarget.Write);

        const familyId = RefreshToken.newFamilyId();
        const accessToken = await this.tokenService.signAccessToken({
            userId:             user.id,
            roleCode:           role.code,
            fspId:              user.fspId,
            mustChangePassword: user.mustChangePassword,
            permissions,
        });

        const issued = this.tokenService.issueRefreshToken();
        const refreshTokenEntity = new RefreshToken(
            user.id,
            familyId,
            issued.hash,
            issued.expiresAt,
        );
        await this.refreshTokenRepository.save(refreshTokenEntity);

        return new LoginCommand.Output(
            accessToken,
            issued.plaintext,
            issued.expiresAt,
            {
                id:                 user.id,
                email:              user.email,
                roleCode:           role.code,
                fspId:              user.fspId,
                mustChangePassword: user.mustChangePassword,
            },
            permissions,
        );
    }

    private async handleFailedAttempt(userId: string, attemptCount: number): Promise<boolean> {

        await this.userRepository.incrementFailedAttempts(userId);

        const threshold = this.settings.loginLockoutThreshold();

        if (attemptCount >= threshold) {
            const lockoutMs = this.settings.loginLockoutDurationMinutes() * 60 * 1000;
            const lockedUntil = new Date(Date.now() + lockoutMs);
            await this.userRepository.lockUntil(userId, lockedUntil);
            LoginHandler.LOGGER.warn(`Account ${userId} locked until ${lockedUntil.toISOString()} after ${attemptCount} failed attempts.`);

            return true;
        }

        return false;
    }

    private accountLockedError(lockoutMinutes: number): {code: string; message: string} {

        const unit = lockoutMinutes === 1 ? 'minute' : 'minutes';

        return {
            code:    AuthErrorCode.ACCOUNT_LOCKED,
            message: `Your account has been temporarily locked due to multiple failed login attempts. Please try again after ${lockoutMinutes} ${unit} or contact your administrator.`,
        };
    }

    private remainingLockoutMinutes(lockedUntil: Date, now: Date): number {

        return Math.max(1, Math.ceil((lockedUntil.getTime() - now.getTime()) / 60_000));
    }
}
