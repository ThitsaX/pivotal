import {CaCert} from './ca-cert';

export abstract class CaCertLoader {

    /**
     * Returns a list of individual CA certificates.
     * CaStore concatenates them into a single combined PEM buffer.
     */
    abstract load(): CaCert[];
}
