import {DynamicModule, Module, Provider} from '@nestjs/common';
import {NatsClientService, NatsClientServiceModule} from '@shared/nats';
import {ConnectorGetPartiesPublisher} from './connector-get-parties.publisher';
import {ConnectorPostQuotesPublisher} from './connector-post-quotes.publisher';
import {ConnectorPostTransfersPublisher} from './connector-post-transfers.publisher';
import {ConnectorPatchTransfersPublisher} from './connector-patch-transfers.publisher';

@Module({})
export class ConnectorPublisherModule {

    static forRootAsync(asyncOptions: ConnectorPublisherModule.AsyncOptions): DynamicModule {
        return {
            module: ConnectorPublisherModule,
            imports: [
                NatsClientServiceModule.forRootAsync({
                    imports: asyncOptions.imports ?? [],
                    inject: asyncOptions.inject ?? [],
                    useFactory: asyncOptions.useFactory,
                }),
            ],
            providers: [
                ...ConnectorPublisherModule.createProviders(),
            ],
            exports: [
                ConnectorGetPartiesPublisher,
                ConnectorPostQuotesPublisher,
                ConnectorPostTransfersPublisher,
                ConnectorPatchTransfersPublisher,
            ],
        };
    }

    private static createProviders(): Provider[] {
        return [
            {
                provide: ConnectorGetPartiesPublisher,
                useFactory: (ncs: NatsClientService) => new ConnectorGetPartiesPublisher(ncs),
                inject: [NatsClientService],
            },
            {
                provide: ConnectorPostQuotesPublisher,
                useFactory: (ncs: NatsClientService) => new ConnectorPostQuotesPublisher(ncs),
                inject: [NatsClientService],
            },
            {
                provide: ConnectorPostTransfersPublisher,
                useFactory: (ncs: NatsClientService) => new ConnectorPostTransfersPublisher(ncs),
                inject: [NatsClientService],
            },
            {
                provide: ConnectorPatchTransfersPublisher,
                useFactory: (ncs: NatsClientService) => new ConnectorPatchTransfersPublisher(ncs),
                inject: [NatsClientService],
            },
        ];
    }
}

export namespace ConnectorPublisherModule {

    export interface RequiredSettings extends NatsClientServiceModule.RequiredSettings {
    }

    export type AsyncOptions = {
        imports?: any[];
        useFactory: (...args: any[]) => RequiredSettings | Promise<RequiredSettings>;
        inject?: any[];
    };
}
