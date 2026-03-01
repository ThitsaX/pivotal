import {EnvBasedPrivateKeyLoader} from './loader/env-based-private-key-loader';
import {JsonBasedPrivateKeyLoader} from './loader/json-based-private-key-loader';
import {PrivateKeyStore} from './private-key-store';

export type PrivateKeyStoreMode = 'env' | 'json';

/**
 * Static factory that builds a fully-loaded PrivateKeyStore in one call.
 *
 * create(mode):
 *   'env'  – loads via EnvBasedPrivateKeyLoader  (FSP_IDS + PRIVATE_KEY_<FSPID>)
 *   'json' – loads via JsonBasedPrivateKeyLoader (JSON_PRIVATE_KEYS)
 *
 * @example — typical module usage
 *   useFactory: (): PrivateKeyStore =>
 *     PrivateKeyStoreFactory.create(process.env['PRIVATE_KEY_STORE_FACTORY'] ?? 'env')
 */
export class PrivateKeyStoreFactory {

    private constructor() {}

    static create(mode: string): PrivateKeyStore {
        const store  = new PrivateKeyStore();
        const loader = PrivateKeyStoreFactory.createLoader(mode);
        store.load(loader);
        return store;
    }

    private static createLoader(mode: string) {
        switch (mode.trim().toLowerCase() as PrivateKeyStoreMode) {
            case 'env':
                return new EnvBasedPrivateKeyLoader();
            case 'json':
                return new JsonBasedPrivateKeyLoader();
            default:
                throw new Error(
                    `Unknown PrivateKeyStoreFactory mode: '${mode}'. Supported: 'env', 'json'.`,
                );
        }
    }
}
