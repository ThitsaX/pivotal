import {PrivateKey} from './private-key';

export abstract class PrivateKeyStore {

    abstract load(): PrivateKeyStore;

    abstract get(fspId: string): PrivateKey | undefined;
}
