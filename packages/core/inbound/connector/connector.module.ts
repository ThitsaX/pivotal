import {DynamicModule, Module, Provider} from '@nestjs/common';
import {NatsClientService, NatsClientServiceModule} from '@shared/nats';
import {FspClient} from './fsp-client';
import {
    InboundConnectorPartiesListener,
    InboundConnectorQuotesListener,
    InboundConnectorTransfersListener,
} from './listener';

const REQUIRED_DEPENDENCIES = Symbol('InboundConnectorRequiredDependencies');

@Module({})
export class InboundConnectorModule {

    static forRootAsync(asyncOptions: InboundConnectorModule.AsyncOptions): DynamicModule {
        return {
            module: InboundConnectorModule,
            imports: [
                NatsClientServiceModule.forRootAsync({
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
                    useFactory: (deps: InboundConnectorModule.RequiredDependencies) => deps.fspClient(),
                    inject: [REQUIRED_DEPENDENCIES],
                },
                ...InboundConnectorModule.createProviders(),
            ],
            exports: [
                InboundConnectorPartiesListener,
                InboundConnectorQuotesListener,
                InboundConnectorTransfersListener,
            ],
        };
    }

    private static createProviders(): Provider[] {
        return [
            {
                provide: InboundConnectorPartiesListener,
                useFactory: (ncs: NatsClientService, fsp: FspClient) => new InboundConnectorPartiesListener(ncs, fsp),
                inject: [NatsClientService, FspClient],
            },
            {
                provide: InboundConnectorQuotesListener,
                useFactory: (ncs: NatsClientService, fsp: FspClient) => new InboundConnectorQuotesListener(ncs, fsp),
                inject: [NatsClientService, FspClient],
            },
            {
                provide: InboundConnectorTransfersListener,
                useFactory: (ncs: NatsClientService, fsp: FspClient) => new InboundConnectorTransfersListener(ncs, fsp),
                inject: [NatsClientService, FspClient],
            },
        ];
    }
}

export namespace InboundConnectorModule {

    export interface RequiredDependencies extends NatsClientServiceModule.RequiredDependencies {
        fspClient(): FspClient;
    }

    export type AsyncOptions = {
        imports?: any[];
        useFactory: (...args: any[]) => RequiredDependencies | Promise<RequiredDependencies>;
        inject?: any[];
    };
}
