import { PublicKey } from './public-key';

export abstract class PublicKeyLoader {

    abstract load(): Map<string, PublicKey>;
}
