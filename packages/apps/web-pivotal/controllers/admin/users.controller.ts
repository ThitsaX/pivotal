// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
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
    Query,
} from '@nestjs/common';
import {CommandBus} from '@nestjs/cqrs';
import {
    AccessTokenClaims,
    adminError,
    AdminErrorCode,
    CreateUserCommand,
    DeactivateUserCommand,
    PermissionKey,
    RequiresPermission,
    ResetUserPasswordCommand,
    Role,
    RoleRepository,
    UpdateUserCommand,
    User,
    UserRepository,
} from '@core/auth/domain';
import {AuthUser} from '../../decorators';
import {
    UserCreateDto,
    UserListQueryDto,
    UserListResponseDto,
    UserResponseDto,
    UserRoleSummaryDto,
    UserUpdateDto,
    UserWithTempPasswordResponseDto,
} from '../../dto/admin';

@Controller('admin/users')
export class UsersAdminController {

    constructor(
        @Inject(CommandBus)
        private readonly commandBus: CommandBus,
        @Inject(UserRepository)
        private readonly userRepository: UserRepository,
        @Inject(RoleRepository)
        private readonly roleRepository: RoleRepository,
    ) {
    }

    @Get()
    @RequiresPermission(PermissionKey.ADMIN_USERS_MANAGE)
    async list(@Query() query: UserListQueryDto): Promise<UserListResponseDto> {

        const page = await this.userRepository.findAll({
            page:     query.page,
            pageSize: query.pageSize,
            roleId:   query.roleId,
            fspId:    query.fspId,
            isActive: query.isActive,
            search:   query.search,
        });

        const roles = await this.roleRepository.findAll();
        const rolesById = new Map(roles.map((r) => [r.id, r]));

        const items = page.items.map((user) => {
            const role = rolesById.get(user.roleId);
            if (role == null) {
                throw new Error(`User ${user.id} references unknown role_id=${user.roleId}.`);
            }
            return UsersAdminController.toUserResponse(user, role);
        });

        return new UserListResponseDto(items, page.page, page.pageSize, page.total);
    }

    @Get(':id')
    @RequiresPermission(PermissionKey.ADMIN_USERS_MANAGE)
    async getById(@Param('id') id: string): Promise<UserResponseDto> {

        const user = await this.userRepository.findById(id);

        if (user == null) {
            throw new NotFoundException(adminError(AdminErrorCode.USER_NOT_FOUND));
        }

        const role = await this.roleRepository.findById(user.roleId);

        if (role == null) {
            throw new Error(`User ${user.id} references unknown role_id=${user.roleId}.`);
        }

        return UsersAdminController.toUserResponse(user, role);
    }

    @Post()
    @RequiresPermission(PermissionKey.ADMIN_USERS_MANAGE)
    async create(@Body() dto: UserCreateDto): Promise<UserWithTempPasswordResponseDto> {

        const output = await this.commandBus.execute<CreateUserCommand, CreateUserCommand.Output>(
            new CreateUserCommand(
                new CreateUserCommand.Input(dto.email, dto.roleId, dto.fspId ?? null),
            ),
        );

        return new UserWithTempPasswordResponseDto(
            UsersAdminController.toUserResponse(output.user, output.role),
            output.tempPassword,
        );
    }

    @Patch(':id')
    @RequiresPermission(PermissionKey.ADMIN_USERS_MANAGE)
    async update(
        @Param('id') id: string,
        @Body() dto: UserUpdateDto,
        @AuthUser() claims: AccessTokenClaims | undefined,
    ): Promise<UserResponseDto> {

        if (claims == null) {
            throw new BadRequestException(adminError(AdminErrorCode.USER_SELF_LOCK));
        }

        const output = await this.commandBus.execute<UpdateUserCommand, UpdateUserCommand.Output>(
            new UpdateUserCommand(
                new UpdateUserCommand.Input(id, claims.sub, dto.roleId, dto.fspId, dto.isActive),
            ),
        );

        return UsersAdminController.toUserResponse(output.user, output.role);
    }

    @Post(':id/reset-password')
    @HttpCode(HttpStatus.OK)
    @RequiresPermission(PermissionKey.ADMIN_USERS_MANAGE)
    async resetPassword(@Param('id') id: string): Promise<UserWithTempPasswordResponseDto> {

        const output = await this.commandBus.execute<ResetUserPasswordCommand, ResetUserPasswordCommand.Output>(
            new ResetUserPasswordCommand(new ResetUserPasswordCommand.Input(id)),
        );

        return new UserWithTempPasswordResponseDto(
            UsersAdminController.toUserResponse(output.user, output.role),
            output.tempPassword,
        );
    }

    @Delete(':id')
    @HttpCode(HttpStatus.OK)
    @RequiresPermission(PermissionKey.ADMIN_USERS_MANAGE)
    async deactivate(
        @Param('id') id: string,
        @AuthUser() claims: AccessTokenClaims | undefined,
    ): Promise<UserResponseDto> {

        if (claims == null) {
            throw new BadRequestException(adminError(AdminErrorCode.USER_SELF_LOCK));
        }

        const output = await this.commandBus.execute<DeactivateUserCommand, DeactivateUserCommand.Output>(
            new DeactivateUserCommand(new DeactivateUserCommand.Input(id, claims.sub)),
        );

        return UsersAdminController.toUserResponse(output.user, output.role);
    }

    private static toUserResponse(user: User, role: Role): UserResponseDto {
        return new UserResponseDto(
            user.id,
            user.email,
            new UserRoleSummaryDto(role.id, role.code, role.name),
            user.fspId,
            user.isActive,
            user.mustChangePassword,
            user.lastLoginAt,
            user.createdAt,
        );
    }
}
