// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {ConflictException, ForbiddenException, Inject, Injectable} from '@nestjs/common';
import {DbTarget} from '@shared/typeorm';
import {adminError, AdminErrorCode} from '../error';
import {ADMIN_ROLE_CODE, DFSP_ADMIN_ROLE_CODE, PermissionKey, Role, User} from '../model';
import {RolePermissionRepository, RoleRepository, UserRepository} from '../repository';

export interface UserManagementContext {
    actor: User;
    actorRole: Role;
    actorPermissions: string[];
    globalManager: boolean;
    dfspManager: boolean;
    managementFspId: string | null;
}

@Injectable()
export class UserManagementPolicy {

    constructor(
        @Inject(UserRepository)
        private readonly userRepository: UserRepository,
        @Inject(RoleRepository)
        private readonly roleRepository: RoleRepository,
        @Inject(RolePermissionRepository)
        private readonly rolePermissionRepository: RolePermissionRepository,
    ) {
    }

    async resolveManagementContext(actorId: string): Promise<UserManagementContext> {

        const actor = await this.userRepository.findById(actorId, DbTarget.Write);

        if (actor == null || !actor.isActive) {
            throw new ForbiddenException(adminError(AdminErrorCode.USER_MANAGEMENT_SCOPE_DENIED));
        }

        const actorRole = await this.roleRepository.findById(actor.roleId, DbTarget.Write);

        if (actorRole == null) {
            throw new ForbiddenException(adminError(AdminErrorCode.USER_MANAGEMENT_SCOPE_DENIED));
        }

        const actorPermissions = await this.rolePermissionRepository.findPermissionKeysByRoleId(actor.roleId, DbTarget.Write);
        const globalManager = actorPermissions.includes(PermissionKey.ADMIN_USERS_MANAGE);
        const dfspManager = actorPermissions.includes(PermissionKey.ADMIN_DFSP_USERS_MANAGE);

        if (!globalManager && !dfspManager) {
            throw new ForbiddenException(adminError(AdminErrorCode.USER_MANAGEMENT_SCOPE_DENIED));
        }

        if (!globalManager && actor.fspId == null) {
            throw new ForbiddenException(adminError(AdminErrorCode.USER_MANAGEMENT_SCOPE_DENIED));
        }

        return {
            actor,
            actorRole,
            actorPermissions,
            globalManager,
            dfspManager,
            managementFspId: globalManager ? null : actor.fspId,
        };
    }

    assertCanManageTarget(context: UserManagementContext, target: User): void {

        if (context.globalManager) {
            return;
        }

        if (context.managementFspId == null || target.fspId !== context.managementFspId) {
            throw new ForbiddenException(adminError(AdminErrorCode.USER_MANAGEMENT_SCOPE_DENIED));
        }
    }

    async canAssignRole(context: UserManagementContext, role: Role): Promise<boolean> {

        if (context.globalManager) {
            return role.code !== ADMIN_ROLE_CODE || context.actorRole.code === ADMIN_ROLE_CODE;
        }

        if (role.scope !== 'DFSP') {
            return false;
        }

        return role.code !== DFSP_ADMIN_ROLE_CODE;
    }

    async assertCanAssignRole(context: UserManagementContext, role: Role): Promise<void> {
        if (!await this.canAssignRole(context, role)) {
            throw new ForbiddenException(adminError(AdminErrorCode.USER_ROLE_NOT_ASSIGNABLE));
        }
    }

    resolveCreateFspId(context: UserManagementContext, requestedFspId: string | null): string | null {
        return context.globalManager ? requestedFspId : context.managementFspId;
    }

    async assertNotLastDfspManager(
        targetUser: User,
        currentRoleId: string,
        nextRoleId: string,
        nextFspId: string | null,
        deactivating: boolean,
    ): Promise<void> {

        if (targetUser.fspId == null) {
            return;
        }

        const currentRole = await this.roleRepository.findById(currentRoleId, DbTarget.Write);

        if (currentRole?.code !== DFSP_ADMIN_ROLE_CODE) {
            return;
        }

        if (!deactivating && currentRoleId === nextRoleId && targetUser.fspId === nextFspId) {
            return;
        }

        if (!deactivating && targetUser.fspId === nextFspId) {
            const nextRole = await this.roleRepository.findById(nextRoleId, DbTarget.Write);
            if (nextRole?.code === DFSP_ADMIN_ROLE_CODE) {
                return;
            }
        }

        const others = await this.userRepository.countActiveUsersByRoleCodeForFsp(
            DFSP_ADMIN_ROLE_CODE,
            targetUser.fspId,
            targetUser.id,
            DbTarget.Write,
        );

        if (others === 0) {
            throw new ConflictException(adminError(AdminErrorCode.USER_LAST_DFSP_ADMIN));
        }
    }
}