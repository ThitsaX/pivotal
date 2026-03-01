import * as https from 'https';
import {DynamicModule, FactoryProvider, Module, ModuleMetadata} from '@nestjs/common';
import {CaStore, CertStoreModule, ClientCertStore} from '@shared/security/component/cert';
import {KeyStoreModule, PrivateKeyStore} from '@shared/security/component/key';
import {FspiopSettings} from '../fspiop-settings';
import {FspiopAxios, FspiopAxiosInterceptor, FspiopAxiosParams} from './fspiop-axios';
import {FspiopSigningInterceptor} from './interceptor';

export type FspiopAxiosToken = string | symbol | typeof FspiopAxios;

export interface FspiopAxiosModuleOptions {
    params?: FspiopAxiosParams;
    interceptors?: FspiopAxiosInterceptor[];
}

export interface FspiopAxiosModuleAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
    useFactory: (...args: any[]) => FspiopAxiosModuleOptions | Promise<FspiopAxiosModuleOptions>;
    inject?: any[];
}

@Module({})
export class FspiopAxiosModule {

    /**
     * Register a FspiopAxios instance synchronously.
     * FspiopSettings is resolved from env variables automatically.
     * FspiopSigningInterceptor is prepended when settings.signJws is true.
     * An mTLS https.Agent is configured when settings.mutualTls is true.
     *
     * @example
     * FspiopAxiosModule.forRoot({
     *   params: { socketTimeoutMs: 30_000, connectionTimeoutMs: 3_000 },
     * })
     *
     * @example — named token
     * FspiopAxiosModule.forRoot({ params: { socketTimeoutMs: 30_000 } }, 'PEER_FSP')
     */
    static forRoot(
        options: FspiopAxiosModuleOptions = {},
        token: FspiopAxiosToken = FspiopAxios,
    ): DynamicModule {
        const provider: FactoryProvider = {
            provide: token,
            useFactory: (
                privateKeyStore: PrivateKeyStore,
                caStore: CaStore,
                clientCertStore: ClientCertStore,
                settings: FspiopSettings,
            ) => {
                const interceptors = FspiopAxiosModule.buildInterceptors(privateKeyStore, settings, options.interceptors);
                const httpsAgent   = FspiopAxiosModule.buildMtlsAgent(options.params ?? {}, settings, caStore, clientCertStore);
                return new FspiopAxios(settings, options.params, interceptors, {}, httpsAgent);
            },
            inject: [PrivateKeyStore, CaStore, ClientCertStore, FspiopSettings],
        };

        return {
            module: FspiopAxiosModule,
            imports: [KeyStoreModule, CertStoreModule],
            providers: [FspiopSettings, provider],
            exports: [provider],
        };
    }

    /**
     * Register a FspiopAxios instance asynchronously.
     * FspiopSettings is resolved from env variables automatically.
     * FspiopSigningInterceptor is prepended when settings.signJws is true.
     * An mTLS https.Agent is configured when settings.mutualTls is true.
     *
     * @example
     * FspiopAxiosModule.forRootAsync({
     *   useFactory: () => ({
     *     params: { socketTimeoutMs: 30_000, connectionTimeoutMs: 3_000 },
     *   }),
     * })
     *
     * @example — with extra deps
     * FspiopAxiosModule.forRootAsync({
     *   imports: [ConfigModule],
     *   useFactory: (config: ConfigService) => ({
     *     params: { socketTimeoutMs: config.get('TIMEOUT') },
     *   }),
     *   inject: [ConfigService],
     * })
     *
     * @example — named token
     * FspiopAxiosModule.forRootAsync({
     *   useFactory: () => ({ params: { socketTimeoutMs: 30_000 } }),
     * }, 'PEER_FSP')
     */
    static forRootAsync(
        asyncOptions: FspiopAxiosModuleAsyncOptions,
        token: FspiopAxiosToken = FspiopAxios,
    ): DynamicModule {
        const provider: FactoryProvider = {
            provide: token,
            useFactory: async (...args: any[]) => {
                // PrivateKeyStore, CaStore, ClientCertStore, FspiopSettings are always appended last
                const settings        = args[args.length - 1] as FspiopSettings;
                const clientCertStore = args[args.length - 2] as ClientCertStore;
                const caStore         = args[args.length - 3] as CaStore;
                const privateKeyStore = args[args.length - 4] as PrivateKeyStore;
                const userArgs        = args.slice(0, -4);
                const options         = await asyncOptions.useFactory(...userArgs);
                const interceptors    = FspiopAxiosModule.buildInterceptors(privateKeyStore, settings, options.interceptors);
                const httpsAgent      = FspiopAxiosModule.buildMtlsAgent(options.params ?? {}, settings, caStore, clientCertStore);
                return new FspiopAxios(settings, options.params, interceptors, {}, httpsAgent);
            },
            inject: [...(asyncOptions.inject ?? []), PrivateKeyStore, CaStore, ClientCertStore, FspiopSettings],
        };

        return {
            module: FspiopAxiosModule,
            imports: [...(asyncOptions.imports ?? []), KeyStoreModule, CertStoreModule],
            providers: [FspiopSettings, provider],
            exports: [provider],
        };
    }

    /**
     * Prepends FspiopSigningInterceptor when settings.signJws is true,
     * then appends any caller-supplied interceptors.
     */
    private static buildInterceptors(
        privateKeyStore: PrivateKeyStore,
        settings: FspiopSettings,
        userInterceptors: FspiopAxiosInterceptor[] = [],
    ): FspiopAxiosInterceptor[] {
        const signingInterceptors: FspiopAxiosInterceptor[] = settings.signJws
            ? [new FspiopSigningInterceptor(privateKeyStore).build()]
            : [];
        return [...signingInterceptors, ...userInterceptors];
    }

    /**
     * Builds an mTLS-enabled https.Agent when settings.mutualTls is true.
     * Returns undefined otherwise, letting FspiopAxios fall back to its
     * default timeout-only agent.
     */
    private static buildMtlsAgent(
        params: FspiopAxiosParams,
        settings: FspiopSettings,
        caStore: CaStore,
        clientCertStore: ClientCertStore,
    ): https.Agent | undefined {
        if (!settings.mutualTls) {
            return undefined;
        }

        return new https.Agent({
            ca:      caStore.toBuffer(),
            cert:    clientCertStore.get()?.certBuffer(),
            key:     clientCertStore.get()?.keyBuffer(),
            timeout: params.connectionTimeoutMs,
        });
    }
}
