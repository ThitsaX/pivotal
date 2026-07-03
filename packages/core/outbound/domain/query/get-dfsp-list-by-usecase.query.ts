// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import { Dfsp } from '../dto';

export class GetDfspListByUsecaseQuery {
    constructor(public readonly usecase: string) {
    }
}

export namespace GetDfspListByUsecaseQuery {
    export type Output = Dfsp[];
}
