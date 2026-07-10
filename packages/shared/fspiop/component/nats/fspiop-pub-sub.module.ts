// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {DynamicModule, Module, Provider} from '@nestjs/common';
import {NatsClientService, NatsClientServiceModule} from '@shared/nats';
import {FspiopResponsePublisher} from './fspiop-response-publisher';
import {FspiopResponseSubscriber} from './fspiop-response-subscriber';

const REQUIRED_SETTINGS = Symbol('FspiopPubSubRequiredSettings');

@Module({})
export class FspiopPubSubModule {

    static forRootAsync(asyncOptions: FspiopPubSubModule.AsyncOptions): DynamicModule {
        return {
            module: FspiopPubSubModule,
            imports: [
                NatsClientServiceModule.forRootAsync({
                    imports: asyncOptions.imports ?? [],
                    inject: asyncOptions.inject ?? [],
                    useFactory: asyncOptions.useFactory,
                }),
                ...(asyncOptions.imports ?? []),
            ],
            providers: [
                {
                    provide: REQUIRED_SETTINGS,
                    useFactory: asyncOptions.useFactory,
                    inject: asyncOptions.inject ?? [],
                },
                ...FspiopPubSubModule.createProviders(),
            ],
            exports: [FspiopResponsePublisher, FspiopResponseSubscriber, NatsClientServiceModule],
        };
    }

    private static createProviders(): Provider[] {
        return [
            {
                provide: FspiopResponsePublisher,
                useFactory: (ncs: NatsClientService): FspiopResponsePublisher => {
                    return new FspiopResponsePublisher(ncs);
                },
                inject: [NatsClientService],
            },
            {
                provide: FspiopResponseSubscriber,
                useFactory: (ncs: NatsClientService): FspiopResponseSubscriber => {
                    return new FspiopResponseSubscriber(ncs);
                },
                inject: [NatsClientService],
            },
        ];
    }
}

export namespace FspiopPubSubModule {

    export interface RequiredSettings extends NatsClientServiceModule.RequiredSettings {
    }

    export type AsyncOptions = {
        imports?: any[];
        useFactory: (...args: any[]) => RequiredSettings | Promise<RequiredSettings>;
        inject?: any[];
    };
}
