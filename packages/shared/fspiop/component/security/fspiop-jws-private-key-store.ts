import {Injectable} from '@nestjs/common';
import {PrivateKey, PrivateKeyStore} from '@shared/security/component/key';

@Injectable()
export class FspiopJwsPrivateKeyStore extends PrivateKeyStore {

    private static readonly ENV_FSPIOP_JWS_PRIVATE_KEY = 'FSPIOP_JWS_PRIVATE_KEY';

    private privateKey: PrivateKey | undefined;

    load(): PrivateKeyStore {
        const privateKeyValue = process.env[FspiopJwsPrivateKeyStore.ENV_FSPIOP_JWS_PRIVATE_KEY];

        if (privateKeyValue == null || privateKeyValue.trim().length === 0) {
            this.privateKey = undefined;
            return this;
        }

        const normalizedPem = privateKeyValue.replace(/\\n/g, '\n');
        this.privateKey = PrivateKey.fromBuffer(Buffer.from(normalizedPem, 'utf-8'));

        return this;
    }

    get(fspId: string): PrivateKey | undefined {
        void fspId;
        return this.privateKey;
    }
}
