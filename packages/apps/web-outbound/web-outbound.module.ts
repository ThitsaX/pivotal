import {DynamicModule, Module, Provider} from '@nestjs/common';
import {AuditProducerModule} from '@core/audit/producer';
import {OutboundDomainModule} from '@core/outbound/domain';
import {FspiopSettings} from '@shared/fspiop';
import {PrivateKeyStore} from '@shared/security';
import {FspiopSigner} from './component';
import {
    LookupController,
    QuoteController,
    TransferController,
} from './controllers';
import {WebOutboundDependencies} from './required.dependencies';

const REQUIRED_DEPENDENCIES = Symbol('WebOutboundRequiredDependencies');

@Module({})
export class WebOutboundModule {

    static forRoot(): DynamicModule {
        return WebOutboundModule.forRootAsync({
            useFactory: (): WebOutboundModule.RequiredDependencies => new WebOutboundDependencies(),
        });
    }

    static forRootAsync(asyncOptions: WebOutboundModule.AsyncOptions): DynamicModule {
        return {
            module: WebOutboundModule,
            imports: [
                OutboundDomainModule.forRootAsync({
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
            controllers: [
                LookupController,
                QuoteController,
                TransferController,
            ],
            providers: [
                ...WebOutboundModule.createProviders(asyncOptions),
            ],
        };
    }

    private static createProviders(asyncOptions: WebOutboundModule.AsyncOptions): Provider[] {
        return [
            {
                provide: REQUIRED_DEPENDENCIES,
                useFactory: asyncOptions.useFactory,
                inject: asyncOptions.inject ?? [],
            },
            {
                provide: FspiopSettings,
                useFactory: (deps: WebOutboundModule.RequiredDependencies): FspiopSettings => deps.fspiopSettings(),
                inject: [REQUIRED_DEPENDENCIES],
            },
            {
                provide: PrivateKeyStore,
                useFactory: (deps: WebOutboundModule.RequiredDependencies): PrivateKeyStore => deps.privateKeyStore(),
                inject: [REQUIRED_DEPENDENCIES],
            },
            {
                provide: FspiopSigner,
                useFactory: (settings: FspiopSettings, privateKeyStore: PrivateKeyStore): FspiopSigner => {
                    return new FspiopSigner(settings, privateKeyStore);
                },
                inject: [FspiopSettings, PrivateKeyStore],
            },
        ];
    }
}

export namespace WebOutboundModule {

    export interface RequiredDependencies
        extends OutboundDomainModule.RequiredDependencies,
            AuditProducerModule.RequiredDependencies {
    }

    export type AsyncOptions = {
        imports?: any[];
        useFactory: (...args: any[]) => RequiredDependencies | Promise<RequiredDependencies>;
        inject?: any[];
    };
}
