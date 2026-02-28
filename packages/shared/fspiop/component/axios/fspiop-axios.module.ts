import { DynamicModule, FactoryProvider, Module, ModuleMetadata } from '@nestjs/common';
import { FspiopAxios, FspiopAxiosInterceptor, FspiopAxiosParams } from './fspiop-axios';
import { FspiopSigningInterceptor } from './interceptor';
import { FspiopSettings } from '../fspiop-settings';
import { KeystoreModule, PrivateKeyStore } from '@shared/security/component/key';

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
            useFactory: (privateKeyStore: PrivateKeyStore, settings: FspiopSettings) => {
                const interceptors = FspiopAxiosModule.buildInterceptors(privateKeyStore, settings, options.interceptors);
                return new FspiopAxios(settings, options.params, interceptors);
            },
            inject: [PrivateKeyStore, FspiopSettings],
        };

        return {
            module: FspiopAxiosModule,
            imports: [KeystoreModule],
            providers: [FspiopSettings, provider],
            exports: [provider],
        };
    }

    /**
     * Register a FspiopAxios instance asynchronously.
     * FspiopSettings is resolved from env variables automatically.
     * FspiopSigningInterceptor is prepended when settings.signJws is true.
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
                // PrivateKeyStore and FspiopSettings are always appended last
                const settings         = args[args.length - 1] as FspiopSettings;
                const privateKeyStore  = args[args.length - 2] as PrivateKeyStore;
                const userArgs         = args.slice(0, -2);
                const options          = await asyncOptions.useFactory(...userArgs);
                const interceptors     = FspiopAxiosModule.buildInterceptors(privateKeyStore, settings, options.interceptors);
                return new FspiopAxios(settings, options.params, interceptors);
            },
            inject: [...(asyncOptions.inject ?? []), PrivateKeyStore, FspiopSettings],
        };

        return {
            module: FspiopAxiosModule,
            imports: [...(asyncOptions.imports ?? []), KeystoreModule],
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
}
