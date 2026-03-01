import {EnvBasedPublicKeyLoader} from './loader/env-based-public-key-loader';
import {JsonBasedPublicKeyLoader} from './loader/json-based-public-key-loader';
import {PublicKeyStore} from './public-key-store';

export type PublicKeyStoreMode = 'env' | 'json';

/**
 * Static factory that builds a fully-loaded PublicKeyStore in one call.
 *
 * create(mode):
 *   'env'  – loads via EnvBasedPublicKeyLoader  (FSP_IDS + PUBLIC_KEY_<FSPID>)
 *   'json' – loads via JsonBasedPublicKeyLoader (JSON_PUBLIC_KEYS)
 *
 * @example — typical module usage
 *   useFactory: (): PublicKeyStore =>
 *     PublicKeyStoreFactory.create(process.env['PUBLIC_KEY_STORE_FACTORY'] ?? 'env')
 */
export class PublicKeyStoreFactory {

    private constructor() {}

    static create(mode: string): PublicKeyStore {
        const store  = new PublicKeyStore();
        const loader = PublicKeyStoreFactory.createLoader(mode);
        store.load(loader);
        return store;
    }

    private static createLoader(mode: string) {
        switch (mode.trim().toLowerCase() as PublicKeyStoreMode) {
            case 'env':
                return new EnvBasedPublicKeyLoader();
            case 'json':
                return new JsonBasedPublicKeyLoader();
            default:
                throw new Error(
                    `Unknown PublicKeyStoreFactory mode: '${mode}'. Supported: 'env', 'json'.`,
                );
        }
    }
}
