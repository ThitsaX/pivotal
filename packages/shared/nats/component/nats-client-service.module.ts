import {DynamicModule, Module, Provider} from '@nestjs/common';
import {NatsClientService} from './nats-client.service';

const REQUIRED_SETTINGS = Symbol('NatsClientServiceRequiredSettings');

@Module({})
export class NatsClientServiceModule {

    static forRootAsync(asyncOptions: NatsClientServiceModule.AsyncOptions): DynamicModule {
        return {
            module: NatsClientServiceModule,
            imports: asyncOptions.imports ?? [],
            providers: [
                {
                    provide: REQUIRED_SETTINGS,
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
                useFactory: (settings: NatsClientServiceModule.RequiredSettings): NatsClientService => {
                    return new NatsClientService(settings.natsUrl());
                },
                inject: [REQUIRED_SETTINGS],
            }
        ];
    }
}

export namespace NatsClientServiceModule {

    export interface RequiredSettings {
        natsUrl(): string;
    }

    export type AsyncOptions = {
        imports?: any[];
        useFactory: (...args: any[]) => RequiredSettings | Promise<RequiredSettings>;
        inject?: any[];
    };
}
