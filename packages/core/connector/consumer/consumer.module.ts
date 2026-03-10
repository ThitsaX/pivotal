import {CommandBus} from '@nestjs/cqrs';
import {DynamicModule, Module, Provider} from '@nestjs/common';
import {NatsClientService, NatsClientServiceModule} from '@shared/nats';
import {ConnectorDomainModule} from '../domain';
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
                useFactory: (ncs: NatsClientService, commandBus: CommandBus) => new ConnectorGetPartiesListener(ncs, commandBus),
                inject: [NatsClientService, CommandBus],
            },
            {
                provide: ConnectorPostQuotesListener,
                useFactory: (ncs: NatsClientService, commandBus: CommandBus) => new ConnectorPostQuotesListener(ncs, commandBus),
                inject: [NatsClientService, CommandBus],
            },
            {
                provide: ConnectorPostTransfersListener,
                useFactory: (ncs: NatsClientService, commandBus: CommandBus) => new ConnectorPostTransfersListener(ncs, commandBus),
                inject: [NatsClientService, CommandBus],
            },
            {
                provide: ConnectorPatchTransfersListener,
                useFactory: (ncs: NatsClientService, commandBus: CommandBus) => new ConnectorPatchTransfersListener(ncs, commandBus),
                inject: [NatsClientService, CommandBus],
            },
        ];
    }
}

export namespace ConnectorConsumerModule {

    export interface RequiredDependencies
        extends NatsClientServiceModule.RequiredDependencies,
                ConnectorDomainModule.RequiredDependencies {
    }

    export type AsyncOptions = {
        imports?: any[];
        useFactory: (...args: any[]) => RequiredDependencies | Promise<RequiredDependencies>;
        inject?: any[];
    };
}
