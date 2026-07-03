// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {BadRequestException, ConflictException, Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {DbTarget} from '@shared/typeorm';
import {adminError, AdminErrorCode} from '../error';
import {Menu} from '../model';
import {MenuRepository} from '../repository';
import {CreateMenuCommand} from './create-menu.command';

@CommandHandler(CreateMenuCommand)
export class CreateMenuHandler implements ICommandHandler<CreateMenuCommand, CreateMenuCommand.Output> {

    constructor(
        @Inject(MenuRepository)
        private readonly menuRepository: MenuRepository,
    ) {
    }

    async execute(command: CreateMenuCommand): Promise<CreateMenuCommand.Output> {

        const {menuKey, groupLabel, label, route, icon, sortOrder, parentId} = command.input;

        const existing = await this.menuRepository.findByMenuKey(menuKey, DbTarget.Write);

        if (existing != null) {
            throw new ConflictException(adminError(AdminErrorCode.MENU_KEY_TAKEN));
        }

        if (parentId != null) {
            const parent = await this.menuRepository.findById(parentId, DbTarget.Write);
            if (parent == null) {
                throw new BadRequestException(adminError(AdminErrorCode.MENU_PARENT_NOT_FOUND));
            }
        }

        const menu = new Menu(
            menuKey,
            groupLabel,
            label,
            route,
            sortOrder ?? 0,
            icon ?? null,
            parentId ?? null,
        );

        const saved = await this.menuRepository.save(menu);

        return new CreateMenuCommand.Output(saved);
    }
}
