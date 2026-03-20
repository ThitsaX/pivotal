import {DynamicModule, Module, Provider} from '@nestjs/common';
import {AuditProducerModule} from '@core/audit/producer';
import {LegacyDomainModule} from '@core/legacy/domain';
import {FspiopSettings} from '@shared/fspiop';
import {PrivateKeyStore} from '@shared/security';
import {FspiopSigner} from './component';
import {SendMoneyController} from './controllers';
import {WebLegacyDependencies} from './required.dependencies';

const REQUIRED_DEPENDENCIES = Symbol('WebLegacyRequiredDependencies');

@Module({})
export class WebLegacyModule {

    static forRoot(): DynamicModule {
        return WebLegacyModule.forRootAsync({
            useFactory: (): WebLegacyModule.RequiredDependencies => new WebLegacyDependencies(),
        });
    }

    static forRootAsync(asyncOptions: WebLegacyModule.AsyncOptions): DynamicModule {
        return {
            module: WebLegacyModule,
            imports: [
                LegacyDomainModule.forRootAsync({
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
            controllers: [SendMoneyController],
            providers: [
                ...WebLegacyModule.createProviders(asyncOptions),
            ],
        };
    }

    private static createProviders(asyncOptions: WebLegacyModule.AsyncOptions): Provider[] {
        return [
            {
                provide: REQUIRED_DEPENDENCIES,
                useFactory: asyncOptions.useFactory,
                inject: asyncOptions.inject ?? [],
            },
            {
                provide: FspiopSettings,
                useFactory: (deps: WebLegacyModule.RequiredDependencies): FspiopSettings => deps.fspiopSettings(),
                inject: [REQUIRED_DEPENDENCIES],
            },
            {
                provide: PrivateKeyStore,
                useFactory: (deps: WebLegacyModule.RequiredDependencies): PrivateKeyStore => deps.privateKeyStore(),
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

export namespace WebLegacyModule {

    export interface RequiredDependencies
        extends LegacyDomainModule.RequiredDependencies,
            AuditProducerModule.RequiredDependencies {
    }

    export type AsyncOptions = {
        imports?: any[];
        useFactory: (...args: any[]) => RequiredDependencies | Promise<RequiredDependencies>;
        inject?: any[];
    };
}
