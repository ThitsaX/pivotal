import {CaStore} from './ca-store';
import {EnvBasedCaCertLoader} from './loader/env-based-ca-cert-loader';
import {JsonBasedCaCertLoader} from './loader/json-based-ca-cert-loader';

export type CaStoreMode = 'env' | 'json';

/**
 * Static factory that builds a fully-loaded CaStore in one call.
 *
 * create(mode):
 *   'env'  – loads via EnvBasedCaCertLoader  (CA_COUNT + CA_CONTENT_N)
 *   'json' – loads via JsonBasedCaCertLoader (JSON_CA_CERTS)
 *
 * @example — typical module usage
 *   useFactory: (): CaStore =>
 *     CaStoreFactory.create(process.env['CA_CERT_STORE_FACTORY'] ?? 'env')
 */
export class CaStoreFactory {

    private constructor() {}

    static create(mode: string): CaStore {
        const store  = new CaStore();
        const loader = CaStoreFactory.createLoader(mode);
        store.load(loader);
        return store;
    }

    private static createLoader(mode: string) {
        switch (mode.trim().toLowerCase() as CaStoreMode) {
            case 'env':
                return new EnvBasedCaCertLoader();
            case 'json':
                return new JsonBasedCaCertLoader();
            default:
                throw new Error(
                    `Unknown CaStoreFactory mode: '${mode}'. Supported: 'env', 'json'.`,
                );
        }
    }
}
