import * as https from 'node:https';
import {DynamicModule, Module, Provider} from '@nestjs/common';
import {CqrsModule} from '@nestjs/cqrs';
import {AuditProducerModule} from '@core/audit/producer';
import {FspiopAxios, FspiopAxiosParams, FspiopSettings, FspiopSigningInterceptor,} from '@shared/fspiop';
import {CaStore, ClientCertStore, PrivateKeyStore} from '@shared/security';
import {
    PerformGetPartiesHandler,
    PerformPatchTransfersHandler,
    PerformPostQuotesHandler,
    PerformPostTransfersHandler,
} from './command';
import {ConnectorSettings, FspClient, FspConnector} from './component';

const REQUIRED_SETTINGS = Symbol('ConnectorDomainRequiredSettings');
const CommandHandlers = [
    PerformGetPartiesHandler,
    PerformPostQuotesHandler,
    PerformPostTransfersHandler,
    PerformPatchTransfersHandler,
];

@Module({})
export class ConnectorDomainModule {

    static forRootAsync(asyncOptions: ConnectorDomainModule.AsyncOptions): DynamicModule {
        return {
            module: ConnectorDomainModule,
            imports: [
                CqrsModule,
                AuditProducerModule.forRootAsync({
                    imports: asyncOptions.imports ?? [],
                    inject: asyncOptions.inject ?? [],
                    useFactory: asyncOptions.useFactory,
                }),
                ...(asyncOptions.imports ?? []),
            ],
            providers: [
                {
                    provide: REQUIRED_SETTINGS,
                    useFactory: asyncOptions.useFactory,
                    inject: asyncOptions.inject ?? [],
                },
                ...ConnectorDomainModule.createProviders(asyncOptions),
            ],
            exports: [
                CqrsModule,
                FspClient,
                FspConnector,
                ConnectorSettings,
            ],
        };
    }

    private static createProviders(asyncOptions: ConnectorDomainModule.AsyncOptions): Provider[] {
        return [
            {
                provide: FspiopSettings,
                useFactory: (settings: ConnectorDomainModule.RequiredSettings): FspiopSettings => settings.fspiopSettings(),
                inject: [REQUIRED_SETTINGS],
            },
            {
                provide: PrivateKeyStore,
                useFactory: (settings: ConnectorDomainModule.RequiredSettings): PrivateKeyStore => settings.privateKeyStore(),
                inject: [REQUIRED_SETTINGS],
            },
            {
                provide: CaStore,
                useFactory: (settings: ConnectorDomainModule.RequiredSettings): CaStore => settings.caStore(),
                inject: [REQUIRED_SETTINGS],
            },
            {
                provide: ClientCertStore,
                useFactory: (settings: ConnectorDomainModule.RequiredSettings): ClientCertStore => settings.clientCertStore(),
                inject: [REQUIRED_SETTINGS],
            },
            {
                provide: FspiopAxios,
                useFactory: (
                    settings: ConnectorDomainModule.RequiredSettings,
                    privateKeyStore: PrivateKeyStore,
                    caStore: CaStore,
                    clientCertStore: ClientCertStore,
                ): FspiopAxios => {
                    const fspiopSettings = settings.fspiopSettings();
                    const fspiopAxiosParams = settings.fspiopAxiosParams();

                    const interceptors = fspiopSettings.useJws
                        ? [new FspiopSigningInterceptor(privateKeyStore).build()]
                        : [];

                    const httpsAgent = fspiopSettings.useMutualTls
                        ? new https.Agent({
                            ca: caStore.get()?.toBuffer(),
                            cert: clientCertStore.get()?.certBuffer(),
                            key: clientCertStore.get()?.keyBuffer(),
                            rejectUnauthorized: fspiopAxiosParams.verifyServerCertificate,
                            timeout: fspiopAxiosParams.connectionTimeoutMs,
                            ...(fspiopAxiosParams.verifyDomain === false
                                ? {checkServerIdentity: () => undefined}
                                : {}),
                        })
                        : undefined;

                    return new FspiopAxios(fspiopSettings, fspiopAxiosParams, interceptors, {}, httpsAgent);
                },
                inject: [REQUIRED_SETTINGS, PrivateKeyStore, CaStore, ClientCertStore],
            },
            {
                provide: ConnectorSettings,
                useFactory: (settings: ConnectorDomainModule.RequiredSettings): ConnectorSettings => new ConnectorSettings(
                    settings.connectorId(),
                    settings.supportedCurrencies(),
                    settings.ilpSecret(),
                ),
                inject: [REQUIRED_SETTINGS],
            },
            ...(asyncOptions.providers ?? []),
            {
                provide: FspConnector,
                useFactory: (fspClient: FspClient, connectorSettings: ConnectorSettings): FspConnector => new FspConnector(fspClient, connectorSettings),
                inject: [FspClient, ConnectorSettings],
            },
            ...CommandHandlers,
        ];
    }
}

export namespace ConnectorDomainModule {

    export interface RequiredSettings
        extends AuditProducerModule.RequiredSettings {
        fspiopSettings(): FspiopSettings;
        fspiopAxiosParams(): FspiopAxiosParams;
        privateKeyStore(): PrivateKeyStore;
        caStore(): CaStore;
        clientCertStore(): ClientCertStore;
        connectorId(): string;
        supportedCurrencies(): ConnectorSettings['supportedCurrencies'];
        ilpSecret(): string;
    }

    export type AsyncOptions = {
        imports?: any[];
        providers?: Provider[];
        useFactory: (...args: any[]) => RequiredSettings | Promise<RequiredSettings>;
        inject?: any[];
    };
}
