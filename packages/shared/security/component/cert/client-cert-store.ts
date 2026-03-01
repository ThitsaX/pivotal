import {Injectable} from '@nestjs/common';
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
@Injectable()
export class ClientCertStore {

    private clientCert: ClientCert | undefined;

    load(loader: ClientCertLoader): void {
        this.clientCert = loader.load();
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
