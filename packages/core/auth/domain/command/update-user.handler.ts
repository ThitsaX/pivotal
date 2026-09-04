// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {BadRequestException, ConflictException, Inject, NotFoundException} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {DbTarget} from '@shared/typeorm';
import {adminError, AdminErrorCode} from '../error';
import {PermissionKey} from '../model';
import {RolePermissionRepository, RoleRepository, UserRepository, UserUpdate} from '../repository';
import {RefreshTokenRepository} from '../repository/refresh-token.repository';
import {UserManagementPolicy} from '../service';
import {UpdateUserCommand} from './update-user.command';

@CommandHandler(UpdateUserCommand)
export class UpdateUserHandler implements ICommandHandler<UpdateUserCommand, UpdateUserCommand.Output> {

    constructor(
        @Inject(UserRepository)
        private readonly userRepository: UserRepository,
        @Inject(RoleRepository)
        private readonly roleRepository: RoleRepository,
        @Inject(RolePermissionRepository)
        private readonly rolePermissionRepository: RolePermissionRepository,
        @Inject(RefreshTokenRepository)
        private readonly refreshTokenRepository: RefreshTokenRepository,
        @Inject(UserManagementPolicy)
        private readonly userManagementPolicy: UserManagementPolicy,
    ) {
    }

    async execute(command: UpdateUserCommand): Promise<UpdateUserCommand.Output> {

        const {targetUserId, actingUserId, roleId, fspId, isActive} = command.input;
        const context = await this.userManagementPolicy.resolveManagementContext(actingUserId);

        const target = await this.userRepository.findById(targetUserId, DbTarget.Write);

        if (target == null) {
            throw new NotFoundException(adminError(AdminErrorCode.USER_NOT_FOUND));
        }

        this.userManagementPolicy.assertCanManageTarget(context, target);

        const isSelf = targetUserId === actingUserId;
        const roleChange = roleId != null && roleId !== target.roleId;
        const deactivation = isActive === false && target.isActive;

        if (isSelf && (roleChange || deactivation)) {
            throw new BadRequestException(adminError(AdminErrorCode.USER_SELF_LOCK));
        }

        const newRole = roleChange
            ? await this.roleRepository.findById(roleId!, DbTarget.Write)
            : await this.roleRepository.findById(target.roleId, DbTarget.Write);

        if (newRole == null) {
            throw new BadRequestException(adminError(AdminErrorCode.USER_ROLE_NOT_FOUND));
        }

        await this.userManagementPolicy.assertCanAssignRole(context, newRole);

        const requestedFspId = fspId === undefined ? target.fspId : (fspId != null && fspId.trim().length > 0 ? fspId.trim() : null);
        const effectiveFspId = context.globalManager ? requestedFspId : context.managementFspId;

        if (newRole.scope === 'HUB' && effectiveFspId != null) {
            throw new BadRequestException(adminError(AdminErrorCode.USER_ADMIN_FORBIDS_FSP_ID));
        }

        if (newRole.scope === 'DFSP' && effectiveFspId == null) {
            throw new BadRequestException(adminError(AdminErrorCode.USER_DFSP_REQUIRES_FSP_ID));
        }

        if (deactivation || roleChange) {
            await this.assertNotLastAdmin(target.id, target.roleId, roleChange ? newRole.id : target.roleId, deactivation);
        }

        await this.userManagementPolicy.assertNotLastDfspManager(
            target,
            target.roleId,
            newRole.id,
            effectiveFspId,
            deactivation,
        );

        const patch: UserUpdate = {};

        if (roleChange) {
            patch.roleId = newRole.id;
        }

        if (effectiveFspId !== target.fspId) {
            patch.fspId = effectiveFspId;
        }

        if (isActive !== undefined && isActive !== target.isActive) {
            patch.isActive = isActive;
        }

        if (Object.keys(patch).length > 0) {
            await this.userRepository.update(target.id, patch);
        }

        await this.userRepository.invalidateTokens(target.id);

        if (deactivation) {
            await this.refreshTokenRepository.revokeAllForUser(target.id);
        }

        const updated = (await this.userRepository.findById(target.id, DbTarget.Write))!;

        return new UpdateUserCommand.Output(updated, newRole);
    }

    private async assertNotLastAdmin(
        targetUserId:    string,
        currentRoleId:   string,
        nextRoleId:      string,
        deactivating:    boolean,
    ): Promise<void> {

        const currentKeys = await this.rolePermissionRepository.findPermissionKeysByRoleId(currentRoleId, DbTarget.Write);
        const targetHoldsAdminToday = currentKeys.includes(PermissionKey.ADMIN_USERS_MANAGE);

        if (!targetHoldsAdminToday) {
            return;
        }

        if (!deactivating && currentRoleId !== nextRoleId) {
            const nextKeys = await this.rolePermissionRepository.findPermissionKeysByRoleId(nextRoleId, DbTarget.Write);
            if (nextKeys.includes(PermissionKey.ADMIN_USERS_MANAGE)) {
                return;
            }
        }

        const others = await this.userRepository.countActiveUsersGrantingPermission(
            PermissionKey.ADMIN_USERS_MANAGE,
            targetUserId,
            DbTarget.Write,
        );

        if (others === 0) {
            throw new ConflictException(adminError(AdminErrorCode.USER_LAST_ADMIN));
        }
    }
}