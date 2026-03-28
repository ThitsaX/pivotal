import {CommandBus} from '@nestjs/cqrs';
import {DynamicModule, Module, Provider} from '@nestjs/common';
import {NatsClientService, NatsClientServiceModule} from '@shared/nats';
import {AuditDomainModule} from '../domain';
import {
    AuditTransactionConsumer,
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
                AuditTransactionConsumer,
            ],
        };
    }

    private static createProviders(): Provider[] {
        return [
            {
                provide: AuditTransactionConsumer,
                useFactory: (ncs: NatsClientService, commandBus: CommandBus) => new AuditTransactionConsumer(ncs, commandBus),
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
