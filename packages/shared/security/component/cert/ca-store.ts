import {Ca} from './ca';

export abstract class CaStore {

    abstract load(): CaStore;

    abstract get(): Ca | undefined;
}
