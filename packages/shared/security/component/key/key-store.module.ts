import {Module} from '@nestjs/common';
import {EnvBasedPrivateKeyLoader} from './loader/env-based-private-key-loader';
import {EnvBasedPublicKeyLoader} from './loader/env-based-public-key-loader';
import {JsonBasedPrivateKeyLoader} from './loader/json-based-private-key-loader';
import {JsonBasedPublicKeyLoader} from './loader/json-based-public-key-loader';
import {PrivateKeyStore} from './private-key-store';
import {PrivateKeyStoreFactory} from './private-key-store-factory';
import {PublicKeyStore} from './public-key-store';
import {PublicKeyStoreFactory} from './public-key-store-factory';

@Module({
    providers: [
        // ── Public key store — built and loaded by the static factory ─────────
        {
            provide: PublicKeyStore,
            useFactory: (): PublicKeyStore => {
                const mode = process.env[KeyStoreModule.ENV_PUBLIC_KEY_STORE_FACTORY] ?? 'env';
                return PublicKeyStoreFactory.create(mode);
            },
        },

        // ── Private key store — built and loaded by the static factory ────────
        {
            provide: PrivateKeyStore,
            useFactory: (): PrivateKeyStore => {
                const mode = process.env[KeyStoreModule.ENV_PRIVATE_KEY_STORE_FACTORY] ?? 'env';
                return PrivateKeyStoreFactory.create(mode);
            },
        }
    ],
    exports: [
        PublicKeyStore,
        PrivateKeyStore
    ],
})
export class KeyStoreModule {

    private static readonly ENV_PUBLIC_KEY_STORE_FACTORY  = 'PUBLIC_KEY_STORE_FACTORY';
    private static readonly ENV_PRIVATE_KEY_STORE_FACTORY = 'PRIVATE_KEY_STORE_FACTORY';
}
