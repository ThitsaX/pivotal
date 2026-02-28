import { Module } from '@nestjs/common';
import { KeystoreModule } from './component/key/keystore.module';

@Module({
  imports: [KeystoreModule],
  providers: [],
  exports: [KeystoreModule],
})
export class SecurityModule {}
