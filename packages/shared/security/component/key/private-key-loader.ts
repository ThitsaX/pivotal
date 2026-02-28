import {PrivateKey} from './private-key';

export abstract class PrivateKeyLoader {

    abstract load(): Map<string, PrivateKey>;
}
