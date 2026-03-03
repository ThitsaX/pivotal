import {DynamicModule, Module, Provider} from '@nestjs/common';
import {CqrsModule} from '@nestjs/cqrs';
import {FspiopPubSubModule} from '@shared/fspiop';
import {NatsClientService} from '@shared/nats';
import {
    InboundPartiesPublisher,
    InboundQuotesPublisher,
    InboundTransfersPublisher,
    InboundPatchTransfersPublisher,
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
        provide: InboundPartiesPublisher,
        useFactory: (ncs: NatsClientService) => new InboundPartiesPublisher(ncs),
        inject: [NatsClientService],
    },
    {
        provide: InboundQuotesPublisher,
        useFactory: (ncs: NatsClientService) => new InboundQuotesPublisher(ncs),
        inject: [NatsClientService],
    },
    {
        provide: InboundTransfersPublisher,
        useFactory: (ncs: NatsClientService) => new InboundTransfersPublisher(ncs),
        inject: [NatsClientService],
    },
    {
        provide: InboundPatchTransfersPublisher,
        useFactory: (ncs: NatsClientService) => new InboundPatchTransfersPublisher(ncs),
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
