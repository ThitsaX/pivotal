import {DynamicModule, Module, Provider} from '@nestjs/common';
import {CqrsModule} from '@nestjs/cqrs';
import {
    FspiopAxiosModule,
    FspiopPubSubModule,
    FspiopSettings,
} from '@shared/fspiop';
import {PostSendMoneyHandler, PutAcceptPartyHandler, PutAcceptQuoteHandler} from './command';
import {RedisClient} from './component';

const REQUIRED_DEPENDENCIES = Symbol('LegacyDomainRequiredDependencies');
const CommandHandlers = [PostSendMoneyHandler, PutAcceptPartyHandler, PutAcceptQuoteHandler];

@Module({})
export class LegacyDomainModule {

    static forRootAsync(asyncOptions: LegacyDomainModule.AsyncOptions): DynamicModule {
        return {
            module: LegacyDomainModule,
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
                ...(asyncOptions.imports ?? []),
            ],
            providers: [
                {
                    provide: REQUIRED_DEPENDENCIES,
                    useFactory: asyncOptions.useFactory,
                    inject: asyncOptions.inject ?? [],
                },
                ...LegacyDomainModule.createProviders(),
            ],
            exports: [CqrsModule, RedisClient],
        };
    }

    private static createProviders(): Provider[] {
        return [
            {
                provide: FspiopSettings,
                useFactory: (deps: LegacyDomainModule.RequiredDependencies) => deps.fspiopSettings(),
                inject: [REQUIRED_DEPENDENCIES],
            },
            {
                provide: RedisClient,
                useFactory: (deps: LegacyDomainModule.RequiredDependencies): RedisClient => {
                    return new RedisClient(deps.redisUrl());
                },
                inject: [REQUIRED_DEPENDENCIES],
            },
            ...CommandHandlers,
        ];
    }
}

export namespace LegacyDomainModule {

    export interface RequiredDependencies
        extends FspiopAxiosModule.RequiredDependencies,
                FspiopPubSubModule.RequiredDependencies {
        redisUrl(): string;
    }

    export type AsyncOptions = {
        imports?: any[];
        useFactory: (...args: any[]) => RequiredDependencies | Promise<RequiredDependencies>;
        inject?: any[];
    };
}
