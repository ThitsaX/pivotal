import { Module } from '@nestjs/common';
import { PrivateKeyStore } from './component/private-key-store';
import { PublicKeyStore } from './component/public-key-store';

@Module({
  imports: [],
  providers: [PublicKeyStore, PrivateKeyStore],
  exports: [PublicKeyStore, PrivateKeyStore],
})
export class KeystoreModule {}
