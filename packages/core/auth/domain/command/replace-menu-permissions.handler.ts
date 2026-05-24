import {BadRequestException, Inject, NotFoundException} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {DbTarget} from '@shared/typeorm';
import {adminError, AdminErrorCode} from '../error';
import {MenuPermissionRepository, MenuRepository, PermissionRepository} from '../repository';
import {ReplaceMenuPermissionsCommand} from './replace-menu-permissions.command';

@CommandHandler(ReplaceMenuPermissionsCommand)
export class ReplaceMenuPermissionsHandler
    implements ICommandHandler<ReplaceMenuPermissionsCommand, ReplaceMenuPermissionsCommand.Output> {

    constructor(
        @Inject(MenuRepository)
        private readonly menuRepository: MenuRepository,
        @Inject(PermissionRepository)
        private readonly permissionRepository: PermissionRepository,
        @Inject(MenuPermissionRepository)
        private readonly menuPermissionRepository: MenuPermissionRepository,
    ) {
    }

    async execute(command: ReplaceMenuPermissionsCommand): Promise<ReplaceMenuPermissionsCommand.Output> {

        const {menuId, permissionKeys} = command.input;

        const menu = await this.menuRepository.findById(menuId, DbTarget.Write);

        if (menu == null) {
            throw new NotFoundException(adminError(AdminErrorCode.MENU_NOT_FOUND));
        }

        const dedupedKeys = Array.from(new Set(permissionKeys));

        const resolved = await this.permissionRepository.findByKeyNames(dedupedKeys, DbTarget.Write);

        if (resolved.length !== dedupedKeys.length) {
            throw new BadRequestException(adminError(AdminErrorCode.PERMISSION_NOT_FOUND));
        }

        const permissionIds = resolved.map((p) => p.id);

        await this.menuPermissionRepository.replaceForMenu(menu.id, permissionIds);

        // No tokens_invalidated_at bump — menu visibility is recomputed live from JWT
        // claims (AC-11.7). Token claims do not encode menu membership.

        const finalKeys = resolved.map((p) => p.keyName).sort();

        return new ReplaceMenuPermissionsCommand.Output(menu.id, finalKeys);
    }
}
