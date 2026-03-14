import {ClientCert} from './client-cert';

export abstract class ClientCertStore {

    abstract load(): ClientCertStore;

    abstract get(): ClientCert | undefined;
}
