import {DynamicModule, Module, Provider} from '@nestjs/common';
import {NatsClientService, NatsClientServiceModule} from '@shared/nats';
import {
    InboundPartiesAuditPublisher,
    InboundQuotesAuditPublisher,
    InboundTransfersAuditPublisher,
    OutboundPartiesAuditPublisher,
    OutboundQuotesAuditPublisher,
    OutboundTransfersAuditPublisher,
} from './publisher';

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
                InboundPartiesAuditPublisher,
                InboundQuotesAuditPublisher,
                InboundTransfersAuditPublisher,
                OutboundPartiesAuditPublisher,
                OutboundQuotesAuditPublisher,
                OutboundTransfersAuditPublisher,
            ],
        };
    }

    private static createProviders(): Provider[] {
        return [
            {
                provide: InboundPartiesAuditPublisher,
                useFactory: (ncs: NatsClientService) => new InboundPartiesAuditPublisher(ncs),
                inject: [NatsClientService],
            },
            {
                provide: InboundQuotesAuditPublisher,
                useFactory: (ncs: NatsClientService) => new InboundQuotesAuditPublisher(ncs),
                inject: [NatsClientService],
            },
            {
                provide: InboundTransfersAuditPublisher,
                useFactory: (ncs: NatsClientService) => new InboundTransfersAuditPublisher(ncs),
                inject: [NatsClientService],
            },
            {
                provide: OutboundPartiesAuditPublisher,
                useFactory: (ncs: NatsClientService) => new OutboundPartiesAuditPublisher(ncs),
                inject: [NatsClientService],
            },
            {
                provide: OutboundQuotesAuditPublisher,
                useFactory: (ncs: NatsClientService) => new OutboundQuotesAuditPublisher(ncs),
                inject: [NatsClientService],
            },
            {
                provide: OutboundTransfersAuditPublisher,
                useFactory: (ncs: NatsClientService) => new OutboundTransfersAuditPublisher(ncs),
                inject: [NatsClientService],
            },
        ];
    }
}

export namespace AuditProducerModule {

    export interface RequiredDependencies extends NatsClientServiceModule.RequiredDependencies {
    }

    export type AsyncOptions = {
        imports?: any[];
        useFactory: (...args: any[]) => RequiredDependencies | Promise<RequiredDependencies>;
        inject?: any[];
    };
}
