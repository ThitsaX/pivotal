import {DynamicModule, Module, Provider} from '@nestjs/common';
import {CqrsModule} from '@nestjs/cqrs';
import {FspiopPubSubModule} from '@shared/fspiop';
import {NatsClientService} from '@shared/nats';
import {
    InboundConnectorPartiesPublisher,
    InboundConnectorQuotesPublisher,
    InboundConnectorTransfersPublisher,
    InboundConnectorPatchTransfersPublisher,
} from './publisher';
import {
    HandleGetPartiesHandler,
    HandlePatchTransfersHandler,
    HandlePostQuotesHandler,
    HandlePostTransfersHandler,
} from './command/payee';
import {
    HandlePutPartiesErrorHandler,
    HandlePutPartiesHandler,
    HandlePutQuotesErrorHandler,
    HandlePutQuotesHandler,
    HandlePutTransfersErrorHandler,
    HandlePutTransfersHandler,
} from './command/payer';

const CommandHandlers = [
    HandleGetPartiesHandler,
    HandlePostQuotesHandler,
    HandlePostTransfersHandler,
    HandlePatchTransfersHandler,
    HandlePutPartiesHandler,
    HandlePutPartiesErrorHandler,
    HandlePutQuotesHandler,
    HandlePutQuotesErrorHandler,
    HandlePutTransfersHandler,
    HandlePutTransfersErrorHandler,
];

const Publishers: Provider[] = [
    {
        provide: InboundConnectorPartiesPublisher,
        useFactory: (ncs: NatsClientService) => new InboundConnectorPartiesPublisher(ncs),
        inject: [NatsClientService],
    },
    {
        provide: InboundConnectorQuotesPublisher,
        useFactory: (ncs: NatsClientService) => new InboundConnectorQuotesPublisher(ncs),
        inject: [NatsClientService],
    },
    {
        provide: InboundConnectorTransfersPublisher,
        useFactory: (ncs: NatsClientService) => new InboundConnectorTransfersPublisher(ncs),
        inject: [NatsClientService],
    },
    {
        provide: InboundConnectorPatchTransfersPublisher,
        useFactory: (ncs: NatsClientService) => new InboundConnectorPatchTransfersPublisher(ncs),
        inject: [NatsClientService],
    },
];

@Module({})
export class InboundDomainModule {

    static forRootAsync(asyncOptions: InboundDomainModule.AsyncOptions): DynamicModule {
        return {
            module: InboundDomainModule,
            imports: [
                CqrsModule,
                FspiopPubSubModule.forRootAsync({
                    imports: asyncOptions.imports ?? [],
                    inject: asyncOptions.inject ?? [],
                    useFactory: asyncOptions.useFactory,
                }),
                ...(asyncOptions.imports ?? []),
            ],
            providers: [...CommandHandlers, ...Publishers],
            exports: [CqrsModule],
        };
    }
}

export namespace InboundDomainModule {

    export interface RequiredDependencies extends FspiopPubSubModule.RequiredDependencies {
    }

    export type AsyncOptions = {
        imports?: any[];
        useFactory: (...args: any[]) => RequiredDependencies | Promise<RequiredDependencies>;
        inject?: any[];
    };
}
