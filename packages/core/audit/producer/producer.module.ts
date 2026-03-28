import {DynamicModule, Module, Provider} from '@nestjs/common';
import {NatsClientService, NatsClientServiceModule} from '@shared/nats';
import {AuditTransactionPublisher} from './publisher';

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
                AuditTransactionPublisher,
            ],
        };
    }

    private static createProviders(): Provider[] {
        return [
            {
                provide: AuditTransactionPublisher,
                useFactory: (ncs: NatsClientService) => new AuditTransactionPublisher(ncs),
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
