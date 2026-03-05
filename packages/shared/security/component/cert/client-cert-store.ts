import {ClientCert} from './client-cert';
import {ClientCertLoader} from './client-cert-loader';

/**
 * Holds the mTLS client certificate and private key pair.
 *
 * Usage with mTLS:
 *   new https.Agent({
 *     ca:   caStore.toBuffer(),
 *     cert: clientCertStore.get()?.certBuffer(),
 *     key:  clientCertStore.get()?.keyBuffer(),
 *   })
 */
export class ClientCertStore {

    constructor(private readonly loader: ClientCertLoader) {
    }

    private clientCert: ClientCert | undefined;

    load(): void {
        this.clientCert = this.loader.load();
    }

    get(): ClientCert | undefined {
        return this.clientCert;
    }

    isEmpty(): boolean {
        return this.clientCert == null;
    }

    clear(): void {
        this.clientCert = undefined;
    }
}
