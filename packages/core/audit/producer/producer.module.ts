// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {DynamicModule, Module, Provider} from '@nestjs/common';
import {NatsClientService, NatsClientServiceModule} from '@shared/nats';
import {AuditTransactionPublisher} from './publisher';

@Module({})
export class AuditProducerModule {

    static forRootAsync(asyncOptions: AuditProducerModule.AsyncOptions): DynamicModule {
        return {
            module: AuditProducerModule,
            imports: [
                NatsClientServiceModule.forRootAsync({
                    imports: asyncOptions.imports ?? [],
                    inject: asyncOptions.inject ?? [],
                    useFactory: asyncOptions.useFactory,
                }),
            ],
            providers: [
                ...AuditProducerModule.createProviders(),
            ],
            exports: [
                AuditTransactionPublisher,
            ],
        };
    }

    private static createProviders(): Provider[] {
        return [
            {
                provide: AuditTransactionPublisher,
                useFactory: (ncs: NatsClientService) => new AuditTransactionPublisher(ncs),
                inject: [NatsClientService],
            },
        ];
    }
}

export namespace AuditProducerModule {

    export interface RequiredSettings extends NatsClientServiceModule.RequiredSettings {
    }

    export type AsyncOptions = {
        imports?: any[];
        useFactory: (...args: any[]) => RequiredSettings | Promise<RequiredSettings>;
        inject?: any[];
    };
}
