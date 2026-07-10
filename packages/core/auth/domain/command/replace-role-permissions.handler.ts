// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {BadRequestException, ConflictException, Inject, NotFoundException} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {DbTarget} from '@shared/typeorm';
import {adminError, AdminErrorCode} from '../error';
import {PermissionRepository, RolePermissionRepository, RoleRepository, UserRepository} from '../repository';
import {ReplaceRolePermissionsCommand} from './replace-role-permissions.command';

const ADMIN_KEY_PREFIX = 'admin.';

@CommandHandler(ReplaceRolePermissionsCommand)
export class ReplaceRolePermissionsHandler
    implements ICommandHandler<ReplaceRolePermissionsCommand, ReplaceRolePermissionsCommand.Output> {

    constructor(
        @Inject(RoleRepository)
        private readonly roleRepository: RoleRepository,
        @Inject(PermissionRepository)
        private readonly permissionRepository: PermissionRepository,
        @Inject(RolePermissionRepository)
        private readonly rolePermissionRepository: RolePermissionRepository,
        @Inject(UserRepository)
        private readonly userRepository: UserRepository,
    ) {
    }

    async execute(command: ReplaceRolePermissionsCommand): Promise<ReplaceRolePermissionsCommand.Output> {

        const {roleId, permissionKeys} = command.input;

        const role = await this.roleRepository.findById(roleId, DbTarget.Write);

        if (role == null) {
            throw new NotFoundException(adminError(AdminErrorCode.ROLE_NOT_FOUND));
        }

        const dedupedKeys = Array.from(new Set(permissionKeys));

        const resolved = await this.permissionRepository.findByKeyNames(dedupedKeys, DbTarget.Write);

        if (resolved.length !== dedupedKeys.length) {
            throw new BadRequestException(adminError(AdminErrorCode.PERMISSION_NOT_FOUND));
        }

        const mismatched = resolved.filter((p) => p.scope !== 'BOTH' && p.scope !== role.scope);

        if (mismatched.length > 0) {
            throw new BadRequestException(adminError(AdminErrorCode.ROLE_PERMISSION_SCOPE_MISMATCH));
        }

        if (role.isSystem) {
            const currentKeys = await this.rolePermissionRepository.findPermissionKeysByRoleId(role.id, DbTarget.Write);
            const currentAdminKeys = currentKeys.filter((k) => k.startsWith(ADMIN_KEY_PREFIX));
            const nextKeySet = new Set(dedupedKeys);
            const removedAdminKey = currentAdminKeys.find((k) => !nextKeySet.has(k));

            if (removedAdminKey != null) {
                throw new ConflictException(adminError(AdminErrorCode.ROLE_CANNOT_REMOVE_ADMIN_KEY));
            }
        }

        const permissionIds = resolved.map((p) => p.id);

        await this.rolePermissionRepository.replaceForRole(role.id, permissionIds);
        await this.userRepository.invalidateTokensForRole(role.id);

        const finalKeys = resolved.map((p) => p.keyName).sort();

        return new ReplaceRolePermissionsCommand.Output(role.id, finalKeys);
    }
}
