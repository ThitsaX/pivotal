import {CaCert} from './ca-cert';
import {CaCertLoader} from './ca-cert-loader';

/**
 * Holds all trusted CA certificates as a single combined PEM buffer.
 *
 * Unlike KeyStore (keyed by FSP ID), CaStore is a flat bundle — Node.js
 * https.Agent accepts the `ca` option as a single Buffer containing one
 * or more concatenated PEM certificates.
 *
 * Usage with mTLS:
 *   new https.Agent({ ca: caStore.toBuffer(), cert: ..., key: ... })
 */
export class CaStore {

    constructor(private readonly loader: CaCertLoader) {
    }

    private combined: Buffer | undefined;

    /**
     * Loads certs from the given loader and concatenates them into the
     * internal combined buffer, appending to any previously loaded certs.
     * Returns the number of certificates loaded in this call.
     */
    load(): number {
        const certs = this.loader.load();

        if (certs.length === 0) {
            return 0;
        }

        const incoming = Buffer.concat(certs.map((c) => c.toBuffer()));

        this.combined = this.combined
            ? Buffer.concat([this.combined, incoming])
            : incoming;

        return certs.length;
    }

    /**
     * Returns the combined PEM buffer suitable for the `ca` option of
     * https.Agent, or undefined if no certificates have been loaded.
     */
    toBuffer(): Buffer | undefined {
        return this.combined ? Buffer.from(this.combined) : undefined;
    }

    /**
     * Returns true if at least one CA certificate has been loaded.
     */
    isEmpty(): boolean {
        return this.combined == null || this.combined.length === 0;
    }

    clear(): void {
        this.combined = undefined;
    }
}
