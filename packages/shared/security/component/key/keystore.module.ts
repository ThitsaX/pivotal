import { Module } from '@nestjs/common';
import { EnvBasedPrivateKeyLoader } from './loader/env-based-private-key-loader';
import { EnvBasedPublicKeyLoader } from './loader/env-based-public-key-loader';
import { JsonBasedPrivateKeyLoader } from './loader/json-based-private-key-loader';
import { JsonBasedPublicKeyLoader } from './loader/json-based-public-key-loader';
import { PrivateKeyStore } from './private-key-store';
import { PublicKeyStore } from './public-key-store';

@Module({
  imports: [],
  providers: [
    PublicKeyStore,
    PrivateKeyStore,
    EnvBasedPublicKeyLoader,
    EnvBasedPrivateKeyLoader,
    {
      provide: JsonBasedPublicKeyLoader,
      useFactory: (): JsonBasedPublicKeyLoader => {
        const source = process.env[KeystoreModule.JSON_PUBLIC_KEYS_ENV_NAME];

        return new JsonBasedPublicKeyLoader(source);
      },
    },
    {
      provide: JsonBasedPrivateKeyLoader,
      useFactory: (): JsonBasedPrivateKeyLoader => {
        const source = process.env[KeystoreModule.JSON_PRIVATE_KEYS_ENV_NAME];

        return new JsonBasedPrivateKeyLoader(source);
      },
    },
  ],
  exports: [
    PublicKeyStore,
    PrivateKeyStore,
    EnvBasedPublicKeyLoader,
    JsonBasedPublicKeyLoader,
    EnvBasedPrivateKeyLoader,
    JsonBasedPrivateKeyLoader,
  ],
})
export class KeystoreModule {

  private static readonly JSON_PRIVATE_KEYS_ENV_NAME = 'JSON_PRIVATE_KEYS';

  private static readonly JSON_PUBLIC_KEYS_ENV_NAME = 'JSON_PUBLIC_KEYS';
}
