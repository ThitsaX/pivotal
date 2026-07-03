// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {FindTransactionsQuery} from './find-transactions.query';

/**
 * Counts the transactions matching the same criteria/window/scope as the list query,
 * but capped at `maxLimit` (`MAX_LIMIT`). The cap is the single system-wide ceiling: the
 * count probe never scans past `maxLimit + 1` index entries, so the worst-case cost is
 * bounded regardless of how many rows actually match.
 *
 * `capped = true` means there are at least `maxLimit` matches (display as "<maxLimit>+");
 * the exact magnitude above the cap is deliberately not computed.
 */
export class CountTransactionsQuery {
    constructor(public readonly input: CountTransactionsQuery.Input) {
    }
}

export namespace CountTransactionsQuery {

    export class Input {
        constructor(
            public readonly maxLimit: number,
            public readonly criteria: FindTransactionsQuery.Criteria = new FindTransactionsQuery.Criteria(),
            public readonly accessScope?: FindTransactionsQuery.AccessScope,
        ) {
        }
    }

    export class Output {
        constructor(
            public readonly count: number,
            public readonly capped: boolean,
            public readonly limit: number,
        ) {
        }
    }
}
