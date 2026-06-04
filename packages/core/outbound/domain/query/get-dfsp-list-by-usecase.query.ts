import { Dfsp } from '../dto';

export class GetDfspListByUsecaseQuery {
   constructor(public readonly usecase: string) {
   }
}

export namespace GetDfspListByUsecaseQuery {
   export type Output = Dfsp[];
}