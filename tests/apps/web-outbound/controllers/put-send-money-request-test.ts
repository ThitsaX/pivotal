import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {plainToInstance} from 'class-transformer';
import {PutSendMoneyRequest} from '../../../../packages/apps/web-outbound/controllers/send-money.controller';

describe('Confirmation extension conversion', () => {
    for (const wrapped of [false, true]) {
        it(`accepts ${wrapped ? 'legacy FSPIOP objects' : 'documented SDK arrays'} without changing the input`, () => {
            const extension = [{key: 'audit', value: 'one'}, {key: 'payerProvidedPayerFee', value: 5}];
            const input = {acceptQuote: true, extensionList: wrapped ? {extension} : extension};
            const before = structuredClone(input);
            const result = plainToInstance(PutSendMoneyRequest, input);
            assert.deepEqual(result.extensionList, {extension: [
                {key: 'audit', value: 'one'}, {key: 'payerProvidedPayerFee', value: '5'},
            ]});
            assert.deepEqual(input, before);
        });
    }
    it('treats an empty SDK extension array as absent', () => {
        assert.equal(plainToInstance(PutSendMoneyRequest, {extensionList: []}).extensionList, undefined);
    });
});
