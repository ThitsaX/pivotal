// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {BadRequestException, Inject, NotFoundException} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {DbTarget} from '@shared/typeorm';
import {adminError, AdminErrorCode} from '../error';
import {MenuRepository, MenuUpdate} from '../repository';
import {UpdateMenuCommand} from './update-menu.command';

@CommandHandler(UpdateMenuCommand)
export class UpdateMenuHandler implements ICommandHandler<UpdateMenuCommand, UpdateMenuCommand.Output> {

    constructor(
        @Inject(MenuRepository)
        private readonly menuRepository: MenuRepository,
    ) {
    }

    async execute(command: UpdateMenuCommand): Promise<UpdateMenuCommand.Output> {

        const {menuId, groupLabel, label, route, icon, sortOrder, parentId, isActive} = command.input;

        const menu = await this.menuRepository.findById(menuId, DbTarget.Write);

        if (menu == null) {
            throw new NotFoundException(adminError(AdminErrorCode.MENU_NOT_FOUND));
        }

        if (parentId != null) {
            if (parentId === menu.id) {
                throw new BadRequestException(adminError(AdminErrorCode.MENU_PARENT_NOT_FOUND));
            }
            const parent = await this.menuRepository.findById(parentId, DbTarget.Write);
            if (parent == null) {
                throw new BadRequestException(adminError(AdminErrorCode.MENU_PARENT_NOT_FOUND));
            }
        }

        const patch: MenuUpdate = {};

        if (groupLabel !== undefined) patch.groupLabel = groupLabel;
        if (label !== undefined) patch.label = label;
        if (route !== undefined) patch.route = route;
        if (icon !== undefined) patch.icon = icon;
        if (sortOrder !== undefined) patch.sortOrder = sortOrder;
        if (parentId !== undefined) patch.parentId = parentId;
        if (isActive !== undefined) patch.isActive = isActive;

        if (Object.keys(patch).length > 0) {
            await this.menuRepository.update(menu.id, patch);
        }

        const refreshed = (await this.menuRepository.findById(menu.id, DbTarget.Write))!;

        return new UpdateMenuCommand.Output(refreshed);
    }
}
