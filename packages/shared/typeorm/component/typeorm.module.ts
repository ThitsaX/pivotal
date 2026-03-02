import {DynamicModule, Module} from '@nestjs/common';
import {TypeOrmModule as NestJsTypeOrmModule} from '@nestjs/typeorm';
import {TypeOrmSettings} from './typeorm-settings';
import {TypeOrmConfigurer} from './typeorm-configurer';

@Module({})
export class TypeOrmModule {

    static forRootAsync(asyncOptions: TypeOrmModule.AsyncOptions): DynamicModule {
        const typeOrmModuleOptions: Record<string, unknown> = {
            imports: asyncOptions.imports ?? [],
            inject: asyncOptions.inject ?? [],
            useFactory: async (...args: any[]) => {
                const deps = await asyncOptions.useFactory(...args);
                return TypeOrmModule.withConnectionName(TypeOrmConfigurer.toTypeOrmOptions(deps.typeOrmSettings()), asyncOptions.connectionName);
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

    export interface RequiredDependencies {
        typeOrmSettings(): TypeOrmSettings;
    }

    export type AsyncOptions = {
        connectionName: string;
        imports?: any[];
        useFactory: (...args: any[]) => RequiredDependencies | Promise<RequiredDependencies>;
        inject?: any[];
    };
}
