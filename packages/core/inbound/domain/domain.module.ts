import {DynamicModule, Module} from '@nestjs/common';
import {CqrsModule} from '@nestjs/cqrs';
import {FspiopPubSubModule} from '@shared/fspiop';
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
            providers: [...CommandHandlers],
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
