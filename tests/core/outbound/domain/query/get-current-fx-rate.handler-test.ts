// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
    GetCurrentFxRateHandler,
    GetCurrentFxRateQuery,
} from '../../../../../packages/core/outbound/domain';
import {CatalystException, CurrentFxRate} from '../../../../../packages/shared/catalyst';
import {FspiopErrors, FspiopException} from '../../../../../packages/shared/fspiop';

const RESPONSE: CurrentFxRate = {
    baseCurrency: 'USD',
    quoteCurrency: 'LRD',
    rate: 184,
    effectiveFrom: '2026-10-05T00:00:00Z',
    updatedAt: '2026-10-05T09:00:00Z',
};

function handlerWith(result: CurrentFxRate | Error): {
    handler: GetCurrentFxRateHandler;
    calls: Array<{baseCurrency: string; quoteCurrency: string}>;
} {
    const calls: Array<{baseCurrency: string; quoteCurrency: string}> = [];
    const handler = new GetCurrentFxRateHandler({
        async getCurrentFxRate(baseCurrency: string, quoteCurrency: string): Promise<CurrentFxRate> {
            calls.push({baseCurrency, quoteCurrency});
            if (result instanceof Error) {
                throw result;
            }
            return result;
        },
    } as never);

    return {handler, calls};
}

function assertFspiopCode(code: string): (error: unknown) => boolean {
    return (error: unknown): boolean => error instanceof FspiopException
        && error.errorDefinition.errorType.code === code;
}

describe('GetCurrentFxRateHandler', () => {
    it('passes the requested pair to Catalyst and returns its object unchanged', async () => {
        const {handler, calls} = handlerWith(RESPONSE);

        const result = await handler.execute(new GetCurrentFxRateQuery('USD', 'LRD'));

        assert.equal(result, RESPONSE);
        assert.deepEqual(calls, [{baseCurrency: 'USD', quoteCurrency: 'LRD'}]);
    });

    it('maps FX_RATE_NOT_FOUND to Pivotal generic ID not found', async () => {
        const {handler} = handlerWith(new CatalystException(
            'FX_RATE_NOT_FOUND',
            'FX rate is not available for USD/LRD.',
        ));

        await assert.rejects(
            () => handler.execute(new GetCurrentFxRateQuery('USD', 'LRD')),
            assertFspiopCode(FspiopErrors.GENERIC_ID_NOT_FOUND.errorType.code),
        );
    });

    it('maps Catalyst timeout and connection errors using the Pivotal standard', async () => {
        const cases: Array<[string, string]> = [
            ['CATALYST_TIMEOUT', FspiopErrors.SERVER_TIMED_OUT.errorType.code],
            ['CATALYST_COMMUNICATION_ERROR', FspiopErrors.COMMUNICATION_ERROR.errorType.code],
        ];

        for (const [catalystCode, pivotalCode] of cases) {
            const {handler} = handlerWith(new CatalystException(catalystCode, 'Catalyst failed.'));
            await assert.rejects(
                () => handler.execute(new GetCurrentFxRateQuery('USD', 'LRD')),
                assertFspiopCode(pivotalCode),
            );
        }
    });
});
