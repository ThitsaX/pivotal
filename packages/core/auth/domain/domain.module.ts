// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {DynamicModule, Module, Provider} from '@nestjs/common';
import {CqrsModule} from '@nestjs/cqrs';
import {JwtModule} from '@nestjs/jwt';
import {TypeOrmModule as NestJsTypeOrmModule} from '@nestjs/typeorm';
import {DbTarget, TypeOrmModule} from '@shared/typeorm';
import {
    ChangePasswordHandler,
    CreateRoleHandler,
    CreateUserHandler,
    DeactivateUserHandler,
    DeleteRoleHandler,
    LoginHandler,
    LogoutHandler,
    RefreshTokensHandler,
    ReplaceRolePermissionsHandler,
    ResetUserPasswordHandler,
    UpdateRoleHandler,
    UpdateUserHandler,
} from './command';
import {Menu, MenuPermission, Permission, RefreshToken, Role, RolePermission, User} from './model';
import {
    MenuPermissionRepository,
    MenuRepository,
    PermissionRepository,
    PIVOTAL_DB_READ_CONNECTION_NAME,
    PIVOTAL_DB_WRITE_CONNECTION_NAME,
    RefreshTokenRepository,
    RolePermissionRepository,
    RoleRepository,
    UserRepository,
} from './repository';
import {AdminUserSeeder, RbacSeeder} from './seed';
import {
    AUTH_DOMAIN_REQUIRED_SETTINGS,
    AuthDomainSettings,
    PasswordService,
    TempPasswordService,
    TokenService,
} from './service';

const Entities = [
    Role,
    User,
    RefreshToken,
    Permission,
    RolePermission,
    Menu,
    MenuPermission,
];

const Repositories = [
    RoleRepository,
    UserRepository,
    RefreshTokenRepository,
    PermissionRepository,
    RolePermissionRepository,
    MenuRepository,
    MenuPermissionRepository,
];

const Services = [
    PasswordService,
    TempPasswordService,
    TokenService,
];

const Seeders = [
    RbacSeeder,
    AdminUserSeeder,
];

const CommandHandlers = [
    LoginHandler,
    RefreshTokensHandler,
    LogoutHandler,
    ChangePasswordHandler,
    CreateUserHandler,
    UpdateUserHandler,
    ResetUserPasswordHandler,
    DeactivateUserHandler,
    CreateRoleHandler,
    UpdateRoleHandler,
    DeleteRoleHandler,
    ReplaceRolePermissionsHandler,
];

@Module({})
export class AuthDomainModule {

    static forRootAsync(asyncOptions: AuthDomainModule.AsyncOptions): DynamicModule {
        return {
            module: AuthDomainModule,
            imports: [
                CqrsModule,
                TypeOrmModule.forRootAsync({
                                               connectionName: PIVOTAL_DB_WRITE_CONNECTION_NAME,
                                               target:         DbTarget.Write,
                                               imports:        asyncOptions.imports ?? [],
                                               inject:         asyncOptions.inject ?? [],
                                               useFactory:     asyncOptions.useFactory,
                                           }),
                TypeOrmModule.forRootAsync({
                                               connectionName: PIVOTAL_DB_READ_CONNECTION_NAME,
                                               target:         DbTarget.Read,
                                               imports:        asyncOptions.imports ?? [],
                                               inject:         asyncOptions.inject ?? [],
                                               useFactory:     asyncOptions.useFactory,
                                           }),
                NestJsTypeOrmModule.forFeature(Entities, PIVOTAL_DB_WRITE_CONNECTION_NAME),
                NestJsTypeOrmModule.forFeature(Entities, PIVOTAL_DB_READ_CONNECTION_NAME),
                JwtModule.registerAsync({
                                            imports:    asyncOptions.imports ?? [],
                                            inject:     asyncOptions.inject ?? [],
                                            useFactory: async (...args: any[]) => {
                                                const settings = await asyncOptions.useFactory(...args);
                                                return {
                                                    secret:      settings.jwtSecret(),
                                                    signOptions: {
                                                        algorithm: 'HS256',
                                                        issuer:    settings.jwtIssuer(),
                                                    },
                                                };
                                            },
                                        }),
                ...(asyncOptions.imports ?? []),
            ],
            providers: [
                {
                    provide:    AUTH_DOMAIN_REQUIRED_SETTINGS,
                    useFactory: asyncOptions.useFactory,
                    inject:     asyncOptions.inject ?? [],
                },
                ...Repositories,
                ...Services,
                ...Seeders,
                ...CommandHandlers,
            ],
            exports: [
                CqrsModule,
                AUTH_DOMAIN_REQUIRED_SETTINGS,
                ...Repositories,
                ...Services,
                ...Seeders,
            ],
        };
    }
}

export namespace AuthDomainModule {

    export interface RequiredSettings extends TypeOrmModule.RequiredSettings, AuthDomainSettings {
    }

    export type AsyncOptions = {
        imports?: any[];
        useFactory: (...args: any[]) => RequiredSettings | Promise<RequiredSettings>;
        inject?: any[];
    };
}
