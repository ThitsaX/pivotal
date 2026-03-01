import { Module } from '@nestjs/common';
import { CertStoreModule } from './component/cert/cert-store.module';
import { KeyStoreModule } from './component/key/key-store.module';

@Module({
  imports: [KeyStoreModule, CertStoreModule],
  providers: [],
  exports: [KeyStoreModule, CertStoreModule],
})
export class SecurityModule {}
