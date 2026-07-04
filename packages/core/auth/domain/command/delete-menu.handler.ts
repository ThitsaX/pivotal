// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {Inject, Logger, NotFoundException} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {DbTarget} from '@shared/typeorm';
import {adminError, AdminErrorCode} from '../error';
import {MenuRepository} from '../repository';
import {SEEDED_MENU_KEYS} from '../seed';
import {DeleteMenuCommand} from './delete-menu.command';

@CommandHandler(DeleteMenuCommand)
export class DeleteMenuHandler implements ICommandHandler<DeleteMenuCommand, DeleteMenuCommand.Output> {

    private static readonly LOGGER = new Logger(DeleteMenuHandler.name);

    constructor(
        @Inject(MenuRepository)
        private readonly menuRepository: MenuRepository,
    ) {
    }

    async execute(command: DeleteMenuCommand): Promise<DeleteMenuCommand.Output> {

        const {menuId} = command.input;

        const menu = await this.menuRepository.findById(menuId, DbTarget.Write);

        if (menu == null) {
            throw new NotFoundException(adminError(AdminErrorCode.MENU_NOT_FOUND));
        }

        if (SEEDED_MENU_KEYS.includes(menu.menuKey)) {
            DeleteMenuHandler.LOGGER.warn(
                `Deleting seeded menu '${menu.menuKey}' (id=${menu.id}). The next cold boot from an empty database will recreate this row; on the current database it will stay deleted.`,
            );
        }

        await this.menuRepository.delete(menu.id);

        return new DeleteMenuCommand.Output(true);
    }
}
