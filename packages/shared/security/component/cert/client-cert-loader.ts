import {ClientCert} from './client-cert';

export abstract class ClientCertLoader {
    abstract load(): ClientCert | undefined;
}
