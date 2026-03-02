import {DynamicModule, Module, Provider} from '@nestjs/common';
import {NatsClientService} from './nats-client.service';

const REQUIRED_DEPENDENCIES = Symbol('NatsClientServiceRequiredDependencies');

@Module({})
export class NatsClientServiceModule {

    static forRootAsync(asyncOptions: NatsClientServiceModule.AsyncOptions): DynamicModule {
        return {
            module: NatsClientServiceModule,
            imports: asyncOptions.imports ?? [],
            providers: [
                {
                    provide: REQUIRED_DEPENDENCIES,
                    useFactory: asyncOptions.useFactory,
                    inject: asyncOptions.inject ?? [],
                },
                ...NatsClientServiceModule.createProviders(),
            ],
            exports: [NatsClientService],
        };
    }

    private static createProviders(): Provider[] {
        return [
            {
                provide: NatsClientService,
                useFactory: (deps: NatsClientServiceModule.RequiredDependencies): NatsClientService => {
                    return new NatsClientService(deps.natsUrl());
                },
                inject: [REQUIRED_DEPENDENCIES],
            },
        ];
    }
}

export namespace NatsClientServiceModule {

    export interface RequiredDependencies {
        natsUrl(): string;
    }

    export type AsyncOptions = {
        imports?: any[];
        useFactory: (...args: any[]) => RequiredDependencies | Promise<RequiredDependencies>;
        inject?: any[];
    };
}
