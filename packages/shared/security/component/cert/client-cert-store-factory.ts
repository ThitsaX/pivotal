import {ClientCertStore} from './client-cert-store';
import {EnvBasedClientCertLoader} from './loader/env-based-client-cert-loader';
import {JsonBasedClientCertLoader} from './loader/json-based-client-cert-loader';

export type ClientCertStoreMode = 'env' | 'json';

/**
 * Static factory that builds a fully-loaded ClientCertStore in one call.
 *
 * create(mode):
 *   'env'  – loads via EnvBasedClientCertLoader  (CLIENT_CERT_CONTENT + CLIENT_CERT_KEY)
 *   'json' – loads via JsonBasedClientCertLoader (JSON_CLIENT_CERT)
 *
 * @example — typical module usage
 *   useFactory: (): ClientCertStore =>
 *     ClientCertStoreFactory.create(process.env['CLIENT_CERT_STORE_FACTORY'] ?? 'env')
 */
export class ClientCertStoreFactory {

    private constructor() {}

    static create(mode: string): ClientCertStore {
        const store  = new ClientCertStore();
        const loader = ClientCertStoreFactory.createLoader(mode);
        store.load(loader);
        return store;
    }

    private static createLoader(mode: string) {
        switch (mode.trim().toLowerCase() as ClientCertStoreMode) {
            case 'env':
                return new EnvBasedClientCertLoader();
            case 'json':
                return new JsonBasedClientCertLoader();
            default:
                throw new Error(
                    `Unknown ClientCertStoreFactory mode: '${mode}'. Supported: 'env', 'json'.`,
                );
        }
    }
}
