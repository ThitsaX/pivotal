import {DynamicModule, Module, Provider} from '@nestjs/common';
import {CqrsModule} from '@nestjs/cqrs';
import {AuditProducerModule} from '@core/audit/producer';
import {
    FspiopAxiosModule,
    FspiopPubSubModule,
    FspiopSettings,
} from '@shared/fspiop';
import {PostSendMoneyHandler, PutAcceptPartyHandler, PutAcceptQuoteHandler} from './command';
import {OutboundSettings, RedisClient} from './component';

const REQUIRED_DEPENDENCIES = Symbol('OutboundDomainRequiredDependencies');
const CommandHandlers = [PostSendMoneyHandler, PutAcceptPartyHandler, PutAcceptQuoteHandler];

@Module({})
export class OutboundDomainModule {

    static forRootAsync(asyncOptions: OutboundDomainModule.AsyncOptions): DynamicModule {
        return {
            module: OutboundDomainModule,
            imports: [
                CqrsModule,
                FspiopAxiosModule.forRootAsync({
                    imports: asyncOptions.imports ?? [],
                    inject: asyncOptions.inject ?? [],
                    useFactory: asyncOptions.useFactory,
                }),
                FspiopPubSubModule.forRootAsync({
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
                ...OutboundDomainModule.createProviders(),
            ],
            exports: [CqrsModule, RedisClient],
        };
    }

    private static createProviders(): Provider[] {
        return [
            {
                provide: FspiopSettings,
                useFactory: (deps: OutboundDomainModule.RequiredDependencies) => deps.fspiopSettings(),
                inject: [REQUIRED_DEPENDENCIES],
            },
            {
                provide: OutboundSettings,
                useFactory: (deps: OutboundDomainModule.RequiredDependencies): OutboundSettings => deps.outboundSettings(),
                inject: [REQUIRED_DEPENDENCIES],
            },
            {
                provide: RedisClient,
                useFactory: (outboundSettings: OutboundSettings): RedisClient => {
                    return new RedisClient(outboundSettings);
                },
                inject: [OutboundSettings],
            },
            ...CommandHandlers,
        ];
    }
}

export namespace OutboundDomainModule {

    export interface RequiredDependencies
        extends FspiopAxiosModule.RequiredDependencies,
                FspiopPubSubModule.RequiredDependencies,
                AuditProducerModule.RequiredDependencies {
        outboundSettings(): OutboundSettings;
    }

    export type AsyncOptions = {
        imports?: any[];
        useFactory: (...args: any[]) => RequiredDependencies | Promise<RequiredDependencies>;
        inject?: any[];
    };
}
