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
        return new CaCert(value);
    }

    toBuffer(): Buffer {
        return Buffer.from(this.value);
    }
}
