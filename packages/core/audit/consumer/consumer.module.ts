import {CommandBus} from '@nestjs/cqrs';
import {DynamicModule, Module, Provider} from '@nestjs/common';
import {NatsClientService, NatsClientServiceModule} from '@shared/nats';
import {AuditDomainModule} from '../domain';
import {
    InboundPartiesListener,
    InboundQuotesListener,
    InboundTransfersListener,
    OutboundPartiesListener,
    OutboundQuotesListener,
    OutboundTransfersListener,
} from './listener';

@Module({})
export class AuditConsumerModule {

    static forRootAsync(asyncOptions: AuditConsumerModule.AsyncOptions): DynamicModule {
        return {
            module: AuditConsumerModule,
            imports: [
                NatsClientServiceModule.forRootAsync({
                    imports: asyncOptions.imports ?? [],
                    inject: asyncOptions.inject ?? [],
                    useFactory: asyncOptions.useFactory,
                }),
                AuditDomainModule.forRootAsync({
                    imports: asyncOptions.imports ?? [],
                    inject: asyncOptions.inject ?? [],
                    useFactory: asyncOptions.useFactory,
                }),
            ],
            providers: [
                ...AuditConsumerModule.createProviders(),
            ],
            exports: [
                InboundPartiesListener,
                InboundQuotesListener,
                InboundTransfersListener,
                OutboundPartiesListener,
                OutboundQuotesListener,
                OutboundTransfersListener,
            ],
        };
    }

    private static createProviders(): Provider[] {
        return [
            {
                provide: InboundPartiesListener,
                useFactory: (ncs: NatsClientService, commandBus: CommandBus) => new InboundPartiesListener(ncs, commandBus),
                inject: [NatsClientService, CommandBus],
            },
            {
                provide: InboundQuotesListener,
                useFactory: (ncs: NatsClientService, commandBus: CommandBus) => new InboundQuotesListener(ncs, commandBus),
                inject: [NatsClientService, CommandBus],
            },
            {
                provide: InboundTransfersListener,
                useFactory: (ncs: NatsClientService, commandBus: CommandBus) => new InboundTransfersListener(ncs, commandBus),
                inject: [NatsClientService, CommandBus],
            },
            {
                provide: OutboundPartiesListener,
                useFactory: (ncs: NatsClientService, commandBus: CommandBus) => new OutboundPartiesListener(ncs, commandBus),
                inject: [NatsClientService, CommandBus],
            },
            {
                provide: OutboundQuotesListener,
                useFactory: (ncs: NatsClientService, commandBus: CommandBus) => new OutboundQuotesListener(ncs, commandBus),
                inject: [NatsClientService, CommandBus],
            },
            {
                provide: OutboundTransfersListener,
                useFactory: (ncs: NatsClientService, commandBus: CommandBus) => new OutboundTransfersListener(ncs, commandBus),
                inject: [NatsClientService, CommandBus],
            },
        ];
    }
}

export namespace AuditConsumerModule {

    export interface RequiredDependencies
        extends NatsClientServiceModule.RequiredDependencies,
                AuditDomainModule.RequiredDependencies {
    }

    export type AsyncOptions = {
        imports?: any[];
        useFactory: (...args: any[]) => RequiredDependencies | Promise<RequiredDependencies>;
        inject?: any[];
    };
}
