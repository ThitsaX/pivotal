// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {
    BadRequestException,
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    HttpStatus,
    Inject,
    NotFoundException,
    Param,
    Patch,
    Post,
} from '@nestjs/common';
import {CommandBus} from '@nestjs/cqrs';
import {
    adminError,
    AdminErrorCode,
    CreateMenuCommand,
    DeleteMenuCommand,
    Menu,
    MenuPermissionRepository,
    MenuRepository,
    PermissionKey,
    RequiresPermission,
    UpdateMenuCommand,
} from '@core/auth/domain';
import {
    MenuCreateDto,
    MenuPermissionsResponseDto,
    MenuResponseDto,
    MenuUpdateDto,
} from '../../dto/admin';

@Controller('admin/menus')
export class MenusAdminController {

    constructor(
        @Inject(CommandBus)
        private readonly commandBus: CommandBus,
        @Inject(MenuRepository)
        private readonly menuRepository: MenuRepository,
        @Inject(MenuPermissionRepository)
        private readonly menuPermissionRepository: MenuPermissionRepository,
    ) {
    }

    @Get()
    @RequiresPermission(PermissionKey.ADMIN_MENUS_MANAGE)
    async list(): Promise<MenuResponseDto[]> {

        const menus = await this.menuRepository.findAllForAdmin();

        const items: MenuResponseDto[] = [];

        for (const menu of menus) {
            items.push(await this.toMenuResponse(menu));
        }

        return items;
    }

    @Get(':id')
    @RequiresPermission(PermissionKey.ADMIN_MENUS_MANAGE)
    async getById(@Param('id') id: string): Promise<MenuResponseDto> {

        const menu = await this.menuRepository.findById(id);

        if (menu == null) {
            throw new NotFoundException(adminError(AdminErrorCode.MENU_NOT_FOUND));
        }

        return this.toMenuResponse(menu);
    }

    @Post()
    @RequiresPermission(PermissionKey.ADMIN_MENUS_MANAGE)
    async create(@Body() dto: MenuCreateDto): Promise<MenuResponseDto> {

        const output = await this.commandBus.execute<CreateMenuCommand, CreateMenuCommand.Output>(
            new CreateMenuCommand(
                new CreateMenuCommand.Input(
                    dto.menuKey,
                    dto.groupLabel,
                    dto.label,
                    dto.route,
                    dto.icon ?? null,
                    dto.sortOrder,
                    dto.parentId ?? null,
                ),
            ),
        );

        return this.toMenuResponse(output.menu);
    }

    @Patch(':id')
    @RequiresPermission(PermissionKey.ADMIN_MENUS_MANAGE)
    async update(
        @Param('id') id: string,
        @Body() dto: MenuUpdateDto,
    ): Promise<MenuResponseDto> {

        if (dto.menuKey !== undefined) {
            throw new BadRequestException(adminError(AdminErrorCode.MENU_IMMUTABLE_FIELD));
        }

        const output = await this.commandBus.execute<UpdateMenuCommand, UpdateMenuCommand.Output>(
            new UpdateMenuCommand(
                new UpdateMenuCommand.Input(
                    id,
                    dto.groupLabel,
                    dto.label,
                    dto.route,
                    dto.icon,
                    dto.sortOrder,
                    dto.parentId,
                    dto.isActive,
                ),
            ),
        );

        return this.toMenuResponse(output.menu);
    }

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    @RequiresPermission(PermissionKey.ADMIN_MENUS_MANAGE)
    async delete(@Param('id') id: string): Promise<void> {

        await this.commandBus.execute<DeleteMenuCommand, DeleteMenuCommand.Output>(
            new DeleteMenuCommand(new DeleteMenuCommand.Input(id)),
        );
    }

    @Get(':id/permissions')
    @RequiresPermission(PermissionKey.ADMIN_MENUS_MANAGE)
    async getPermissions(@Param('id') id: string): Promise<MenuPermissionsResponseDto> {

        const menu = await this.menuRepository.findById(id);

        if (menu == null) {
            throw new NotFoundException(adminError(AdminErrorCode.MENU_NOT_FOUND));
        }

        const keys = await this.menuPermissionRepository.findPermissionKeysByMenuId(menu.id);
        return new MenuPermissionsResponseDto(keys.sort());
    }

    private async toMenuResponse(menu: Menu): Promise<MenuResponseDto> {
        const permissionCount = await this.menuPermissionRepository.countByMenuId(menu.id);
        return new MenuResponseDto(
            menu.id,
            menu.menuKey,
            menu.parentId,
            menu.groupLabel,
            menu.label,
            menu.route,
            menu.icon,
            menu.sortOrder,
            menu.isActive,
            permissionCount,
        );
    }
}
