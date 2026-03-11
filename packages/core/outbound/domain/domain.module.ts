import {DynamicModule, Module, Provider} from '@nestjs/common';
import {CqrsModule} from '@nestjs/cqrs';
import {
    FspiopAxiosModule,
    FspiopPubSubModule,
    FspiopSettings,
} from '@shared/fspiop';
import {DoLookupHandler, DoQuotingHandler, DoTransferHandler} from './command';

const REQUIRED_DEPENDENCIES = Symbol('OutboundDomainRequiredDependencies');
const CommandHandlers = [DoLookupHandler, DoQuotingHandler, DoTransferHandler];

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
            exports: [CqrsModule],
        };
    }

    private static createProviders(): Provider[] {
        return [
            {
                provide: FspiopSettings,
                useFactory: (deps: OutboundDomainModule.RequiredDependencies) => deps.fspiopSettings(),
                inject: [REQUIRED_DEPENDENCIES],
            },
            ...CommandHandlers,
        ];
    }
}

export namespace OutboundDomainModule {

    export interface RequiredDependencies
        extends FspiopAxiosModule.RequiredDependencies,
                FspiopPubSubModule.RequiredDependencies {
    }

    export type AsyncOptions = {
        imports?: any[];
        useFactory: (...args: any[]) => RequiredDependencies | Promise<RequiredDependencies>;
        inject?: any[];
    };
}
