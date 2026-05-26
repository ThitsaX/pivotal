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
    Put,
} from '@nestjs/common';
import {CommandBus} from '@nestjs/cqrs';
import {
    adminError,
    AdminErrorCode,
    CreateRoleCommand,
    DeleteRoleCommand,
    PermissionKey,
    ReplaceRolePermissionsCommand,
    RequiresPermission,
    Role,
    RolePermissionRepository,
    RoleRepository,
    UpdateRoleCommand,
    UserRepository,
} from '@core/auth/domain';
import {
    RoleCreateDto,
    RolePermissionsDto,
    RolePermissionsResponseDto,
    RoleResponseDto,
    RoleUpdateDto,
} from '../../dto/admin';

@Controller('admin/roles')
export class RolesAdminController {

    constructor(
        @Inject(CommandBus)
        private readonly commandBus: CommandBus,
        @Inject(RoleRepository)
        private readonly roleRepository: RoleRepository,
        @Inject(RolePermissionRepository)
        private readonly rolePermissionRepository: RolePermissionRepository,
        @Inject(UserRepository)
        private readonly userRepository: UserRepository,
    ) {
    }

    @Get()
    @RequiresPermission(PermissionKey.ADMIN_ROLES_MANAGE)
    async list(): Promise<RoleResponseDto[]> {

        const roles = await this.roleRepository.findAll();

        const items: RoleResponseDto[] = [];

        for (const role of roles) {
            items.push(await this.toRoleResponse(role));
        }

        return items;
    }

    @Get(':id')
    @RequiresPermission(PermissionKey.ADMIN_ROLES_MANAGE)
    async getById(@Param('id') id: string): Promise<RoleResponseDto> {

        const role = await this.roleRepository.findById(id);

        if (role == null) {
            throw new NotFoundException(adminError(AdminErrorCode.ROLE_NOT_FOUND));
        }

        return this.toRoleResponse(role);
    }

    @Post()
    @RequiresPermission(PermissionKey.ADMIN_ROLES_MANAGE)
    async create(@Body() dto: RoleCreateDto): Promise<RoleResponseDto> {

        const output = await this.commandBus.execute<CreateRoleCommand, CreateRoleCommand.Output>(
            new CreateRoleCommand(
                new CreateRoleCommand.Input(dto.code, dto.name, dto.scope, dto.description ?? null),
            ),
        );

        return this.toRoleResponse(output.role);
    }

    @Patch(':id')
    @RequiresPermission(PermissionKey.ADMIN_ROLES_MANAGE)
    async update(
        @Param('id') id: string,
        @Body() dto: RoleUpdateDto,
    ): Promise<RoleResponseDto> {

        if (dto.code !== undefined || dto.isSystem !== undefined) {
            throw new BadRequestException(adminError(AdminErrorCode.ROLE_IMMUTABLE_FIELD));
        }

        const output = await this.commandBus.execute<UpdateRoleCommand, UpdateRoleCommand.Output>(
            new UpdateRoleCommand(
                new UpdateRoleCommand.Input(id, dto.name, dto.description),
            ),
        );

        return this.toRoleResponse(output.role);
    }

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    @RequiresPermission(PermissionKey.ADMIN_ROLES_MANAGE)
    async delete(@Param('id') id: string): Promise<void> {

        await this.commandBus.execute<DeleteRoleCommand, DeleteRoleCommand.Output>(
            new DeleteRoleCommand(new DeleteRoleCommand.Input(id)),
        );
    }

    @Get(':id/permissions')
    @RequiresPermission(PermissionKey.ADMIN_ROLES_MANAGE)
    async getPermissions(@Param('id') id: string): Promise<RolePermissionsResponseDto> {

        const role = await this.roleRepository.findById(id);

        if (role == null) {
            throw new NotFoundException(adminError(AdminErrorCode.ROLE_NOT_FOUND));
        }

        const keys = await this.rolePermissionRepository.findPermissionKeysByRoleId(role.id);
        return new RolePermissionsResponseDto(keys.sort());
    }

    @Put(':id/permissions')
    @RequiresPermission(PermissionKey.ADMIN_ROLES_MANAGE)
    async replacePermissions(
        @Param('id') id: string,
        @Body() dto: RolePermissionsDto,
    ): Promise<RolePermissionsResponseDto> {

        const output = await this.commandBus.execute<
            ReplaceRolePermissionsCommand,
            ReplaceRolePermissionsCommand.Output
        >(
            new ReplaceRolePermissionsCommand(
                new ReplaceRolePermissionsCommand.Input(id, dto.permissionKeys),
            ),
        );

        return new RolePermissionsResponseDto(output.permissionKeys);
    }

    private async toRoleResponse(role: Role): Promise<RoleResponseDto> {
        const [userCount, permissionCount] = await Promise.all([
            this.userRepository.countByRoleId(role.id),
            this.rolePermissionRepository.countByRoleId(role.id),
        ]);
        return new RoleResponseDto(
            role.id,
            role.code,
            role.name,
            role.description,
            role.scope,
            role.isSystem,
            userCount,
            permissionCount,
        );
    }
}
