import {DynamicModule, Module, Provider} from '@nestjs/common';
import {AuditDomainModule} from '@core/audit/domain';
import {ParticipantDomainModule} from '@core/participant/domain';
import {
    AddFspCurrencyController,
    AddHubCurrencyController,
    AddHubSigningKeysController,
    AddSigningKeysController,
    GenerateSigningKeyController,
    ListCentralLedgerParticipantsController,
    OnboardFspController,
    TransactionsAuditController,
    UpsertEndpointController,
} from './controllers';
import {WebPivotalSettings} from './required.settings';

const REQUIRED_SETTINGS = Symbol('WebPivotalRequiredSettings');

@Module({})
export class WebPivotalModule {

    static forRoot(): DynamicModule {
        return WebPivotalModule.forRootAsync({
                                                 useFactory: (): WebPivotalModule.RequiredSettings => new WebPivotalSettings(),
                                             });
    }

    static forRootAsync(asyncOptions: WebPivotalModule.AsyncOptions): DynamicModule {
        return {
            module: WebPivotalModule,
            imports: [
                AuditDomainModule.forRootAsync({
                                                   imports: asyncOptions.imports ?? [],
                                                   inject: asyncOptions.inject ?? [],
                                                   useFactory: asyncOptions.useFactory,
                                               }),
                ParticipantDomainModule.forRootAsync({
                                                         imports: asyncOptions.imports ?? [],
                                                         inject: asyncOptions.inject ?? [],
                                                         useFactory: asyncOptions.useFactory,
                                                     }),
                ...(asyncOptions.imports ?? []),
            ],
            controllers: [
                OnboardFspController,
                AddFspCurrencyController,
                AddHubCurrencyController,
                AddHubSigningKeysController,
                AddSigningKeysController,
                ListCentralLedgerParticipantsController,
                UpsertEndpointController,
                GenerateSigningKeyController,
                TransactionsAuditController,
            ],
            providers: [
                ...WebPivotalModule.createProviders(asyncOptions),
            ],
        };
    }

    private static createProviders(asyncOptions: WebPivotalModule.AsyncOptions): Provider[] {
        return [
            {
                provide: REQUIRED_SETTINGS,
                useFactory: asyncOptions.useFactory,
                inject: asyncOptions.inject ?? [],
            },
        ];
    }
}

export namespace WebPivotalModule {

    export interface RequiredSettings
        extends AuditDomainModule.RequiredSettings,
            ParticipantDomainModule.RequiredSettings {
    }

    export type AsyncOptions = {
        imports?: any[];
        useFactory: (...args: any[]) => RequiredSettings | Promise<RequiredSettings>;
        inject?: any[];
    };
}
