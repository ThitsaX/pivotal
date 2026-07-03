// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {DynamicModule, Module} from '@nestjs/common';
import {TypeOrmModule as NestJsTypeOrmModule} from '@nestjs/typeorm';
import {TypeOrmSettings} from './typeorm-settings';
import {DbTarget, TypeOrmConfigurer} from './typeorm-configurer';

@Module({})
export class TypeOrmModule {

    static forRootAsync(asyncOptions: TypeOrmModule.AsyncOptions): DynamicModule {

        const typeOrmModuleOptions: Record<string, unknown> = {
            imports: asyncOptions.imports ?? [],
            inject: asyncOptions.inject ?? [],
            useFactory: async (...args: any[]) => {
                const deps = await asyncOptions.useFactory(...args);
                const settings = asyncOptions.target === DbTarget.Write
                    ? deps.writeTypeOrmSettings()
                    : deps.readTypeOrmSettings();
                return TypeOrmModule.withConnectionName(TypeOrmConfigurer.toTypeOrmOptions(settings), asyncOptions.connectionName);
            },
        };

        typeOrmModuleOptions['name'] = asyncOptions.connectionName;

        return {
            module: TypeOrmModule,
            imports: [
                NestJsTypeOrmModule.forRootAsync(typeOrmModuleOptions as any),
            ],
            exports: [NestJsTypeOrmModule],
        };
    }

    private static withConnectionName(options: Record<string, unknown>, connectionName: string): Record<string, unknown> {
        return {
            ...options,
            ['name']: connectionName,
        };
    }
}

export namespace TypeOrmModule {

    export interface RequiredSettings {
        writeTypeOrmSettings(): TypeOrmSettings;
        readTypeOrmSettings(): TypeOrmSettings;
    }

    export type AsyncOptions = {
        connectionName: string;
        target: DbTarget;
        imports?: any[];
        useFactory: (...args: any[]) => RequiredSettings | Promise<RequiredSettings>;
        inject?: any[];
    };
}
