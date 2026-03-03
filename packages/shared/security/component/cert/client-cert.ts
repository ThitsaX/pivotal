import {createPrivateKey, X509Certificate} from 'node:crypto';

export class ClientCert {

    private constructor(
        private readonly cert: Buffer,
        private readonly key: Buffer,
    ) {}

    static fromBuffers(cert: Buffer, key: Buffer): ClientCert {
        ClientCert.assertCertificate(cert);
        ClientCert.assertPrivateKey(key);

        return new ClientCert(Buffer.from(cert), Buffer.from(key));
    }

    private static assertCertificate(value: Buffer): void {
        if (value == null || value.length === 0) {
            throw new Error('Client certificate buffer cannot be empty.');
        }

        try {
            new X509Certificate(value);
        } catch {
            throw new Error('Invalid client certificate buffer. Expected a valid X.509 certificate.');
        }
    }

    private static assertPrivateKey(value: Buffer): void {
        if (value == null || value.length === 0) {
            throw new Error('Client private key buffer cannot be empty.');
        }

        try {
            createPrivateKey(value);
        } catch {
            throw new Error('Invalid client private key buffer. Expected a valid private key.');
        }
    }

    certBuffer(): Buffer {
        return Buffer.from(this.cert);
    }

    keyBuffer(): Buffer {
        return Buffer.from(this.key);
    }
}
