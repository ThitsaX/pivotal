import {CqrsModule} from '@nestjs/cqrs';
import {DynamicModule, Module} from '@nestjs/common';
import {AuditProducerModule} from '@core/audit/producer';
import {FspiopAxiosModule} from '@shared/fspiop';
import {
    HandleGetPartiesHandler,
    HandlePatchTransfersHandler,
    HandlePostQuotesHandler,
    HandlePostTransfersHandler,
} from './command';
import {ConnectorSettings, FspClient} from './component';

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
                FspiopAxiosModule.forRootAsync({
                    imports: asyncOptions.imports ?? [],
                    inject: asyncOptions.inject ?? [],
                    useFactory: asyncOptions.useFactory,
                }),
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
                {
                    provide: ConnectorSettings,
                    useFactory: (deps: ConnectorDomainModule.RequiredDependencies) => deps.connectorSettings(),
                    inject: [REQUIRED_DEPENDENCIES],
                },
                ...CommandHandlers,
            ],
            exports: [
                CqrsModule,
                FspClient,
                ConnectorSettings,
            ],
        };
    }
}

export namespace ConnectorDomainModule {

    export interface RequiredDependencies
        extends FspiopAxiosModule.RequiredDependencies,
                AuditProducerModule.RequiredDependencies {
        fspClient(): FspClient;
        connectorSettings(): ConnectorSettings;
    }

    export type AsyncOptions = {
        imports?: any[];
        useFactory: (...args: any[]) => RequiredDependencies | Promise<RequiredDependencies>;
        inject?: any[];
    };
}
