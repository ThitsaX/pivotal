import {PublicKey} from './public-key';

export abstract class AccessKeyStore {

    abstract load(): AccessKeyStore;

    abstract get(fspId: string): PublicKey | undefined;
}
