import * as https from 'https';
import {DynamicModule, Module, Provider} from '@nestjs/common';
import {CaStore, ClientCertStore} from '@shared/security/component/cert';
import {PrivateKeyStore, PublicKeyStore} from '@shared/security/component/key';
import {FspiopAxios, FspiopAxiosParams} from './fspiop-axios';
import {FspiopSettings} from '../fspiop-settings';
import {FspiopSigningInterceptor} from './interceptor';

const REQUIRED_DEPENDENCIES = Symbol('FspiopAxiosRequiredDependencies');

@Module({})
export class FspiopAxiosModule {

    static forRootAsync(asyncOptions: FspiopAxiosModule.AsyncOptions): DynamicModule {
        return {
            module: FspiopAxiosModule,
            imports: asyncOptions.imports ?? [],
            providers: [
                {
                    provide: REQUIRED_DEPENDENCIES,
                    useFactory: asyncOptions.useFactory,
                    inject: asyncOptions.inject ?? [],
                },
                ...FspiopAxiosModule.createProviders(),
            ],
            exports: [FspiopAxios],
        };
    }

    private static createProviders(): Provider[] {
        return [
            {
                provide: FspiopAxios,
                useFactory: (deps: FspiopAxiosModule.RequiredDependencies): FspiopAxios => {
                    const settings = deps.fspiopSettings();
                    const privateKeyStore = deps.privateKeyStore();
                    const caStore = deps.caStore();
                    const clientCertStore = deps.clientCertStore();
                    const params = deps.fspiopAxiosParams?.() ?? {};

                    const interceptors = settings.signJws
                        ? [new FspiopSigningInterceptor(privateKeyStore).build()]
                        : [];

                    const httpsAgent = settings.mutualTls
                        ? new https.Agent({
                            ca:   caStore.toBuffer(),
                            cert: clientCertStore.get()?.certBuffer(),
                            key:  clientCertStore.get()?.keyBuffer(),
                            timeout: params.connectionTimeoutMs,
                        })
                        : undefined;

                    return new FspiopAxios(settings, params, interceptors, {}, httpsAgent);
                },
                inject: [REQUIRED_DEPENDENCIES],
            },
        ];
    }
}

export namespace FspiopAxiosModule {

    export interface RequiredDependencies {
        fspiopSettings(): FspiopSettings;
        fspiopAxiosParams?(): FspiopAxiosParams;
        publicKeyStore(): PublicKeyStore;
        privateKeyStore(): PrivateKeyStore;
        caStore(): CaStore;
        clientCertStore(): ClientCertStore;
    }

    export type AsyncOptions = {
        imports?: any[];
        useFactory: (...args: any[]) => RequiredDependencies | Promise<RequiredDependencies>;
        inject?: any[];
    };
}
