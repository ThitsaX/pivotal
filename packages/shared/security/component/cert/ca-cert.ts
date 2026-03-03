import {X509Certificate} from 'node:crypto';

/**
 * Immutable value object wrapping a single CA certificate in PEM format.
 * Multiple CaCerts can be combined in CaStore for use as the `ca` option
 * in Node.js https.Agent (mTLS).
 */
export class CaCert {

    private readonly value: Buffer;

    private constructor(value: Buffer) {
        this.value = Buffer.from(value);
    }

    static fromBuffer(value: Buffer): CaCert {
        CaCert.assertCertificate(value);
        return new CaCert(value);
    }

    private static assertCertificate(value: Buffer): void {
        if (value == null || value.length === 0) {
            throw new Error('Certificate buffer cannot be empty.');
        }

        try {
            new X509Certificate(value);
        } catch {
            throw new Error('Invalid certificate buffer. Expected a valid X.509 certificate.');
        }
    }

    toBuffer(): Buffer {
        return Buffer.from(this.value);
    }
}
