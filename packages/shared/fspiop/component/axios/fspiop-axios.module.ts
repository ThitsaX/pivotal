import { DynamicModule, FactoryProvider, Module, ModuleMetadata } from '@nestjs/common';
import { FspiopAxios, FspiopAxiosInterceptor, FspiopAxiosParams } from './fspiop-axios';

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
     *
     * @example — default token (inject as FspiopAxios)
     * FspiopAxiosModule.forRoot({ params: { basePath: 'http://switch.local' } })
     *
     * @example — with interceptors
     * FspiopAxiosModule.forRoot({
     *   params: { basePath: 'http://switch.local' },
     *   interceptors: [myAuthInterceptor],
     * })
     *
     * @example — named token (inject with @Inject('PEER_FSP'))
     * FspiopAxiosModule.forRoot({ params: { basePath: 'http://peer.local' } }, 'PEER_FSP')
     */
    static forRoot(
        options: FspiopAxiosModuleOptions = {},
        token: FspiopAxiosToken = FspiopAxios,
    ): DynamicModule {
        const provider = {
            provide: token,
            useValue: new FspiopAxios(options.params, options.interceptors),
        };

        return {
            module: FspiopAxiosModule,
            providers: [provider],
            exports: [provider],
        };
    }

    /**
     * Register a FspiopAxios instance asynchronously (e.g. using ConfigService).
     *
     * @example — default token
     * FspiopAxiosModule.forRootAsync({
     *   imports: [ConfigModule],
     *   useFactory: (config: ConfigService, auth: AuthService) => ({
     *     params: { basePath: config.get('SWITCH_URL') },
     *     interceptors: [
     *       async (req) => {
     *         req.headers['Authorization'] = `Bearer ${await auth.getToken()}`;
     *         return req;
     *       },
     *     ],
     *   }),
     *   inject: [ConfigService, AuthService],
     * })
     *
     * @example — named token
     * FspiopAxiosModule.forRootAsync({
     *   imports: [ConfigModule],
     *   useFactory: (config: ConfigService) => ({
     *     params: { basePath: config.get('PEER_URL') },
     *   }),
     *   inject: [ConfigService],
     * }, 'PEER_FSP')
     */
    static forRootAsync(
        asyncOptions: FspiopAxiosModuleAsyncOptions,
        token: FspiopAxiosToken = FspiopAxios,
    ): DynamicModule {
        const provider: FactoryProvider = {
            provide: token,
            useFactory: async (...args: any[]) => {
                const options = await asyncOptions.useFactory(...args);
                return new FspiopAxios(options.params, options.interceptors);
            },
            inject: asyncOptions.inject ?? [],
        };

        return {
            module: FspiopAxiosModule,
            imports: asyncOptions.imports ?? [],
            providers: [provider],
            exports: [provider],
        };
    }
}
