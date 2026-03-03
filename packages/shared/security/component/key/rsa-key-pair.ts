import {generateKeyPairSync} from 'node:crypto';
import {PrivateKey} from './private-key';
import {PublicKey} from './public-key';

export class RsaKeyPair {

    private static readonly MODULUS_LENGTH = 2048;

    private constructor() {
    }

    static generate(size: number = this.MODULUS_LENGTH): RsaKeyPair.KeyPair {
        const generated = generateKeyPairSync('rsa', {
            modulusLength: size,
            privateKeyEncoding: {
                format: 'pem',
                type: 'pkcs8',
            },
            publicKeyEncoding: {
                format: 'pem',
                type: 'spki',
            },
        });

        const privateKey = PrivateKey.fromBuffer(Buffer.from(generated.privateKey, 'utf-8'));
        const publicKey = PublicKey.fromBuffer(Buffer.from(generated.publicKey, 'utf-8'));

        return new RsaKeyPair.KeyPair(privateKey, publicKey);
    }
}

export namespace RsaKeyPair {

    export class KeyPair {

        readonly privateKey: PrivateKey;

        readonly publicKey: PublicKey;

        constructor(privateKey: PrivateKey, publicKey: PublicKey) {
            this.privateKey = privateKey;
            this.publicKey = publicKey;
        }
    }
}
