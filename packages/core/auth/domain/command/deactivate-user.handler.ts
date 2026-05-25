import {BadRequestException, ConflictException, Inject, NotFoundException} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {DbTarget} from '@shared/typeorm';
import {adminError, AdminErrorCode} from '../error';
import {PermissionKey} from '../model';
import {RolePermissionRepository, RoleRepository, UserRepository} from '../repository';
import {RefreshTokenRepository} from '../repository/refresh-token.repository';
import {DeactivateUserCommand} from './deactivate-user.command';

@CommandHandler(DeactivateUserCommand)
export class DeactivateUserHandler
    implements ICommandHandler<DeactivateUserCommand, DeactivateUserCommand.Output> {

    constructor(
        @Inject(UserRepository)
        private readonly userRepository: UserRepository,
        @Inject(RoleRepository)
        private readonly roleRepository: RoleRepository,
        @Inject(RolePermissionRepository)
        private readonly rolePermissionRepository: RolePermissionRepository,
        @Inject(RefreshTokenRepository)
        private readonly refreshTokenRepository: RefreshTokenRepository,
    ) {
    }

    async execute(command: DeactivateUserCommand): Promise<DeactivateUserCommand.Output> {

        const {targetUserId, actingUserId} = command.input;

        if (targetUserId === actingUserId) {
            throw new BadRequestException(adminError(AdminErrorCode.USER_SELF_LOCK));
        }

        const target = await this.userRepository.findById(targetUserId, DbTarget.Write);

        if (target == null) {
            throw new NotFoundException(adminError(AdminErrorCode.USER_NOT_FOUND));
        }

        const role = (await this.roleRepository.findById(target.roleId, DbTarget.Write))!;

        if (!target.isActive) {
            return new DeactivateUserCommand.Output(target, role);
        }

        const grants = await this.rolePermissionRepository.findPermissionKeysByRoleId(target.roleId, DbTarget.Write);

        if (grants.includes(PermissionKey.ADMIN_USERS_MANAGE)) {
            const others = await this.userRepository.countActiveUsersGrantingPermission(
                PermissionKey.ADMIN_USERS_MANAGE,
                target.id,
                DbTarget.Write,
            );

            if (others === 0) {
                throw new ConflictException(adminError(AdminErrorCode.USER_LAST_ADMIN));
            }
        }

        await this.userRepository.deactivate(target.id);
        await this.refreshTokenRepository.revokeAllForUser(target.id);
        await this.userRepository.invalidateTokens(target.id);

        const refreshed = (await this.userRepository.findById(target.id, DbTarget.Write))!;

        return new DeactivateUserCommand.Output(refreshed, role);
    }
}
