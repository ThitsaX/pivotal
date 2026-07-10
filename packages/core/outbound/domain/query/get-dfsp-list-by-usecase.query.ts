// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import { Dfsp } from '../dto';

export class GetDfspListByUsecaseQuery {
    constructor(public readonly usecase: string) {
    }
}

export namespace GetDfspListByUsecaseQuery {
    export type Output = Dfsp[];
}
