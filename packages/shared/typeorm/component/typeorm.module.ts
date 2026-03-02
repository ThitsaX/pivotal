import {DynamicModule, Module} from '@nestjs/common';
import {TypeOrmModule as NestJsTypeOrmModule} from '@nestjs/typeorm';
import {TypeOrmSettings} from './typeorm-settings';
import {TypeOrmConfigurer} from './typeorm-configurer';

@Module({})
export class TypeOrmModule {

    static forRootAsync(asyncOptions: TypeOrmModule.AsyncOptions): DynamicModule {
        return {
            module: TypeOrmModule,
            imports: [
                NestJsTypeOrmModule.forRootAsync({
                    name: asyncOptions.connectionName,
                    imports: asyncOptions.imports ?? [],
                    inject: asyncOptions.inject ?? [],
                    useFactory: async (...args: any[]) => {
                        const deps = await asyncOptions.useFactory(...args);
                        return TypeOrmConfigurer.toTypeOrmOptions(deps.typeOrmSettings());
                    },
                }),
            ],
            exports: [NestJsTypeOrmModule],
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
