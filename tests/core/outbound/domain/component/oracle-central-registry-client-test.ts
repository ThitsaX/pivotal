import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {FspiopException} from '@shared/fspiop';
import {OracleCentralRegistryClient} from '../../../../../packages/core/outbound/domain/component/oracle-central-registry-client';
import {RegisterMsisdnRequest} from '../../../../../packages/core/outbound/domain/dto';

const NOT_IMPLEMENTED_ERROR_CODE = '2002';

function request(): RegisterMsisdnRequest {
    return {
        requestId:    'request-1',
        msisdn:       '2769100001',
        otpReference: 'otp-reference-1',
        otp:          '123456',
    };
}

function isNotImplementedError(error: unknown): boolean {
    return error instanceof FspiopException
        && error.errorDefinition.errorType.code === NOT_IMPLEMENTED_ERROR_CODE;
}

describe('OracleCentralRegistryClient without a configured endpoint', () => {

    for (const [label, endpoint] of [
        ['undefined', undefined],
        ['empty', ''],
        ['blank', '   '],
    ] as Array<[string, string | undefined]>) {

        it(`constructs when the endpoint is ${label}`, () => {
            assert.doesNotThrow(() => new OracleCentralRegistryClient(endpoint));
        });

        it(`rejects registerMsisdn with NOT_IMPLEMENTED when the endpoint is ${label}`, async () => {
            const client = new OracleCentralRegistryClient(endpoint);

            await assert.rejects(
                () => client.registerMsisdn('payerfsp', request()),
                isNotImplementedError,
            );
        });
    }
});
