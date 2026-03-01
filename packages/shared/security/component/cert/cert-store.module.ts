import {Module} from '@nestjs/common';
import {CaStore} from './ca-store';
import {CaStoreFactory} from './ca-store-factory';
import {ClientCertStore} from './client-cert-store';
import {ClientCertStoreFactory} from './client-cert-store-factory';
import {EnvBasedCaCertLoader} from './loader/env-based-ca-cert-loader';
import {EnvBasedClientCertLoader} from './loader/env-based-client-cert-loader';
import {JsonBasedCaCertLoader} from './loader/json-based-ca-cert-loader';
import {JsonBasedClientCertLoader} from './loader/json-based-client-cert-loader';

@Module({
    providers: [
        // ── CA store — built and loaded by the static factory ─────────────────
        {
            provide: CaStore,
            useFactory: (): CaStore => {
                const mode = process.env[CertStoreModule.ENV_CA_CERT_STORE_FACTORY] ?? 'env';
                return CaStoreFactory.create(mode);
            },
        },

        // ── Client cert store — built and loaded by the static factory ─────────
        {
            provide: ClientCertStore,
            useFactory: (): ClientCertStore => {
                const mode = process.env[CertStoreModule.ENV_CLIENT_CERT_STORE_FACTORY] ?? 'env';
                return ClientCertStoreFactory.create(mode);
            },
        }
    ],
    exports: [
        CaStore,
        ClientCertStore
    ],
})
export class CertStoreModule {

    private static readonly ENV_CA_CERT_STORE_FACTORY     = 'CA_CERT_STORE_FACTORY';
    private static readonly ENV_CLIENT_CERT_STORE_FACTORY = 'CLIENT_CERT_STORE_FACTORY';
}
