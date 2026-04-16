import {DynamicModule, Module, Provider} from '@nestjs/common';
import {OutboundDomainModule} from '@core/outbound/domain';
import {ParticipantAccessKeyStore, ParticipantDomainModule, ParticipantJwsPrivateKeyStore,} from '@core/participant/domain';
import {AccessGuard} from './component';
import {SendMoneyController} from './controllers';
import {WebOutboundSettings} from './required.settings';
import {AccessKeyStore, CaStore, ClientCertStore, PrivateKeyStore} from '@shared/security';
import {ParticipantSigningKeysCache} from "@core/participant/domain/component/store/participant-signing-keys-cache";
import {FspiopMtlsCaStore, FspiopMtlsClientCertStore} from "@shared/fspiop";

const REQUIRED_SETTINGS = Symbol('WebOutboundRequiredSettings');

@Module({})
export class WebOutboundModule {

    static forRoot(): DynamicModule {
        return WebOutboundModule.forRootAsync({
                                                  useFactory: (): WebOutboundModule.RequiredSettings => new WebOutboundSettings(),
                                              });
    }

    static forRootAsync(asyncOptions: WebOutboundModule.AsyncOptions): DynamicModule {

        const participantDomainModule =
            ParticipantDomainModule.forRootAsync(
                {
                    imports: asyncOptions.imports ?? [],
                    inject: asyncOptions.inject ?? [],
                    useFactory: asyncOptions.useFactory,
                });

        const outboundDomainModule =
            OutboundDomainModule.forRootAsync(
                {
                    imports: [participantDomainModule, ...(asyncOptions.imports ?? [])],
                    providers: WebOutboundModule.createOutboundDomainProviders(),
                    useFactory: asyncOptions.useFactory,
                    inject: asyncOptions.inject ?? [],
                });

        return {
            module: WebOutboundModule,
            imports: [
                participantDomainModule,
                outboundDomainModule,
                ...(asyncOptions.imports ?? []),
            ],
            controllers: [SendMoneyController],
            providers: [
                ...WebOutboundModule.createProviders(asyncOptions),
            ],
        };
    }

    private static createProviders(asyncOptions: WebOutboundModule.AsyncOptions): Provider[] {
        return [
            {
                provide: REQUIRED_SETTINGS,
                useFactory: asyncOptions.useFactory,
                inject: asyncOptions.inject ?? [],
            },
            {
                provide: AccessKeyStore,
                useFactory: (cache: ParticipantSigningKeysCache): AccessKeyStore => {
                    return new ParticipantAccessKeyStore(cache);
                },
                inject: [ParticipantSigningKeysCache],
            },
            {
                provide: AccessGuard,
                useFactory: (accessKeyStore: AccessKeyStore): AccessGuard => {
                    return new AccessGuard(accessKeyStore);
                },
                inject: [AccessKeyStore],
            }

        ];
    }

    private static createOutboundDomainProviders(): Provider[] {
        return [
            {
                provide: PrivateKeyStore,
                useFactory: (cache: ParticipantSigningKeysCache): PrivateKeyStore => {
                    return new ParticipantJwsPrivateKeyStore(cache);
                },
                inject: [ParticipantSigningKeysCache],
            },
            {
                provide: CaStore,
                useFactory: (): CaStore => {
                    return new FspiopMtlsCaStore().load();
                },
                inject: [],
            },
            {
                provide: ClientCertStore,
                useFactory: (): ClientCertStore => {
                    return new FspiopMtlsClientCertStore().load();
                },
                inject: [],
            },
        ];
    }
}

export namespace WebOutboundModule {

    export interface RequiredSettings extends ParticipantDomainModule.RequiredSettings, OutboundDomainModule.RequiredSettings {

    }

    export type AsyncOptions = {
        imports?: any[];
        useFactory: (...args: any[]) => RequiredSettings | Promise<RequiredSettings>;
        inject?: any[];
    };
}
