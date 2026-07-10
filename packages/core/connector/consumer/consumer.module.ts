// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {CommandBus} from '@nestjs/cqrs';
import {DynamicModule, Module, Provider} from '@nestjs/common';
import {NatsClientService, NatsClientServiceModule} from '@shared/nats';
import {ConnectorDomainModule, ConnectorSettings} from '../domain';
import {
    ConnectorGetPartiesListener,
    ConnectorPatchTransfersListener,
    ConnectorPostQuotesListener,
    ConnectorPostTransfersListener,
} from './listener';

@Module({})
export class ConnectorConsumerModule {

    static forRootAsync(asyncOptions: ConnectorConsumerModule.AsyncOptions): DynamicModule {
        return {
            module: ConnectorConsumerModule,
            imports: [
                NatsClientServiceModule.forRootAsync({
                    imports: asyncOptions.imports ?? [],
                    inject: asyncOptions.inject ?? [],
                    useFactory: asyncOptions.useFactory,
                }),
                ConnectorDomainModule.forRootAsync({
                    imports: asyncOptions.imports ?? [],
                    providers: asyncOptions.providers ?? [],
                    inject: asyncOptions.inject ?? [],
                    useFactory: asyncOptions.useFactory,
                }),
            ],
            providers: [
                ...ConnectorConsumerModule.createProviders(),
            ],
            exports: [
                ConnectorGetPartiesListener,
                ConnectorPostQuotesListener,
                ConnectorPostTransfersListener,
                ConnectorPatchTransfersListener,
            ],
        };
    }

    private static createProviders(): Provider[] {
        return [
            {
                provide: ConnectorGetPartiesListener,
                useFactory: (
                    ncs: NatsClientService,
                    commandBus: CommandBus,
                    connectorSettings: ConnectorSettings,
                ) => new ConnectorGetPartiesListener(ncs, commandBus, connectorSettings),
                inject: [NatsClientService, CommandBus, ConnectorSettings],
            },
            {
                provide: ConnectorPostQuotesListener,
                useFactory: (
                    ncs: NatsClientService,
                    commandBus: CommandBus,
                    connectorSettings: ConnectorSettings,
                ) => new ConnectorPostQuotesListener(ncs, commandBus, connectorSettings),
                inject: [NatsClientService, CommandBus, ConnectorSettings],
            },
            {
                provide: ConnectorPostTransfersListener,
                useFactory: (
                    ncs: NatsClientService,
                    commandBus: CommandBus,
                    connectorSettings: ConnectorSettings,
                ) => new ConnectorPostTransfersListener(ncs, commandBus, connectorSettings),
                inject: [NatsClientService, CommandBus, ConnectorSettings],
            },
            {
                provide: ConnectorPatchTransfersListener,
                useFactory: (
                    ncs: NatsClientService,
                    commandBus: CommandBus,
                    connectorSettings: ConnectorSettings,
                ) => new ConnectorPatchTransfersListener(ncs, commandBus, connectorSettings),
                inject: [NatsClientService, CommandBus, ConnectorSettings],
            },
        ];
    }
}

export namespace ConnectorConsumerModule {

    export interface RequiredSettings
        extends NatsClientServiceModule.RequiredSettings,
                ConnectorDomainModule.RequiredSettings {
    }

    export type AsyncOptions = {
        imports?: any[];
        providers?: Provider[];
        useFactory: (...args: any[]) => RequiredSettings | Promise<RequiredSettings>;
        inject?: any[];
    };
}
