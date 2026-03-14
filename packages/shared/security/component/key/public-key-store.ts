import {PublicKey} from './public-key';

export abstract class PublicKeyStore {

    abstract load(): PublicKeyStore;

    abstract get(fspId: string): PublicKey | undefined;
}
