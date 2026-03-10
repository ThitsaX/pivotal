import {CqrsModule} from '@nestjs/cqrs';
import {DynamicModule, Module} from '@nestjs/common';
import {AuditProducerModule} from '@core/audit/producer';
import {
    HandleGetPartiesHandler,
    HandlePatchTransfersHandler,
    HandlePostQuotesHandler,
    HandlePostTransfersHandler,
} from './command';
import {FspClient} from './fsp-client';

const REQUIRED_DEPENDENCIES = Symbol('ConnectorDomainRequiredDependencies');

const CommandHandlers = [
    HandleGetPartiesHandler,
    HandlePostQuotesHandler,
    HandlePostTransfersHandler,
    HandlePatchTransfersHandler,
];

@Module({})
export class ConnectorDomainModule {

    static forRootAsync(asyncOptions: ConnectorDomainModule.AsyncOptions): DynamicModule {
        return {
            module: ConnectorDomainModule,
            imports: [
                CqrsModule,
                AuditProducerModule.forRootAsync({
                    imports: asyncOptions.imports ?? [],
                    inject: asyncOptions.inject ?? [],
                    useFactory: asyncOptions.useFactory,
                }),
                ...(asyncOptions.imports ?? []),
            ],
            providers: [
                {
                    provide: REQUIRED_DEPENDENCIES,
                    useFactory: asyncOptions.useFactory,
                    inject: asyncOptions.inject ?? [],
                },
                {
                    provide: FspClient,
                    useFactory: (deps: ConnectorDomainModule.RequiredDependencies) => deps.fspClient(),
                    inject: [REQUIRED_DEPENDENCIES],
                },
                ...CommandHandlers,
            ],
            exports: [
                CqrsModule,
                FspClient,
            ],
        };
    }
}

export namespace ConnectorDomainModule {

    export interface RequiredDependencies extends AuditProducerModule.RequiredDependencies {
        fspClient(): FspClient;
    }

    export type AsyncOptions = {
        imports?: any[];
        useFactory: (...args: any[]) => RequiredDependencies | Promise<RequiredDependencies>;
        inject?: any[];
    };
}
