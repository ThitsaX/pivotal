// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {RawCurrentFxRate} from '@shared/catalyst';

export class GetCurrentFxRateQuery {
    constructor(
        public readonly baseCurrency: string,
        public readonly quoteCurrency: string,
    ) {
    }
}

export namespace GetCurrentFxRateQuery {
    export type Output = RawCurrentFxRate;
}
