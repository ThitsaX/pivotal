import {DynamicModule, Module, Provider} from '@nestjs/common';
import {ParticipantDomainModule, ParticipantJwsPublicKeyStore, ParticipantRepository} from '@core/participant/domain';
import {InboundDomainModule} from '@core/inbound/domain';
import {FspInboundGuard, FspiopSettings} from '@shared/fspiop';
import {PartiesController, QuotesController, TransfersController,} from './controllers';
import {WebInboundSettings} from './required.settings';
import {ParticipantSigningKeysCache} from "@core/participant/domain/component/store/participant-signing-keys-cache";

const REQUIRED_SETTINGS = Symbol('WebInboundRequiredSettings');

@Module({})
export class WebInboundModule {

    static forRoot(): DynamicModule {
        return WebInboundModule.forRootAsync({
                                                 useFactory: (): WebInboundModule.RequiredSettings => new WebInboundSettings(),
                                             });
    }

    static forRootAsync(asyncOptions: WebInboundModule.AsyncOptions): DynamicModule {
        return {
            module: WebInboundModule,
            imports: [
                ParticipantDomainModule.forRootAsync({
                                                         imports: asyncOptions.imports ?? [],
                                                         inject: asyncOptions.inject ?? [],
                                                         useFactory: asyncOptions.useFactory,
                                                     }),
                InboundDomainModule.forRootAsync({
                                                     imports: asyncOptions.imports ?? [],
                                                     inject: asyncOptions.inject ?? [],
                                                     useFactory: asyncOptions.useFactory,
                                                 }),
                ...(asyncOptions.imports ?? []),
            ],
            controllers: [
                PartiesController,
                QuotesController,
                TransfersController,
            ],
            providers: [
                ...WebInboundModule.createProviders(asyncOptions),
            ],
        };
    }

    private static createProviders(asyncOptions: WebInboundModule.AsyncOptions): Provider[] {
        return [
            {
                provide: REQUIRED_SETTINGS,
                useFactory: asyncOptions.useFactory,
                inject: asyncOptions.inject ?? [],
            },
            {
                provide: FspInboundGuard,
                useFactory: (settings: WebInboundModule.RequiredSettings, participantSigningKeysCache: ParticipantSigningKeysCache): FspInboundGuard => {
                    return new FspInboundGuard(
                        new ParticipantJwsPublicKeyStore(participantSigningKeysCache),
                        settings.fspiopSettings(),
                    );
                },
                inject: [REQUIRED_SETTINGS, ParticipantSigningKeysCache],
            }
        ];
    }

}

export namespace WebInboundModule {

    export interface RequiredSettings
        extends InboundDomainModule.RequiredSettings,
            ParticipantDomainModule.RequiredSettings {
        fspiopSettings(): FspiopSettings;
    }

    export type AsyncOptions = {
        imports?: any[];
        useFactory: (...args: any[]) => RequiredSettings | Promise<RequiredSettings>;
        inject?: any[];
    };
}
