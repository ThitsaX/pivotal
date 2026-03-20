import {DynamicModule, Module, Provider} from '@nestjs/common';
import {CqrsModule} from '@nestjs/cqrs';
import {
    FspiopAxiosModule,
    FspiopPubSubModule,
    FspiopSettings,
} from '@shared/fspiop';
import {PostSendMoneyHandler, PutAcceptPartyHandler, PutAcceptQuoteHandler} from './command';
import {LegacySettings, RedisClient} from './component';

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
                provide: LegacySettings,
                useFactory: (deps: LegacyDomainModule.RequiredDependencies): LegacySettings => deps.legacySettings(),
                inject: [REQUIRED_DEPENDENCIES],
            },
            {
                provide: RedisClient,
                useFactory: (legacySettings: LegacySettings): RedisClient => {
                    return new RedisClient(legacySettings);
                },
                inject: [LegacySettings],
            },
            ...CommandHandlers,
        ];
    }
}

export namespace LegacyDomainModule {

    export interface RequiredDependencies
        extends FspiopAxiosModule.RequiredDependencies,
                FspiopPubSubModule.RequiredDependencies {
        legacySettings(): LegacySettings;
    }

    export type AsyncOptions = {
        imports?: any[];
        useFactory: (...args: any[]) => RequiredDependencies | Promise<RequiredDependencies>;
        inject?: any[];
    };
}
