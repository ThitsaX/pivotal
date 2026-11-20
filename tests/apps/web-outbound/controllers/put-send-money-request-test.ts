import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {plainToInstance} from 'class-transformer';
import {PutSendMoneyRequest, SendMoneyController} from '../../../../packages/apps/web-outbound/controllers/send-money.controller';
import {PutAcceptPartyCommand, PutAcceptQuoteCommand} from '../../../../packages/core/outbound/domain';

describe('Confirmation extension conversion', () => {
    async function dispatch(input: Record<string, unknown>) {
        let captured: PutAcceptPartyCommand | PutAcceptQuoteCommand | undefined;
        const controller = new SendMoneyController({
            async execute(command: PutAcceptPartyCommand | PutAcceptQuoteCommand) {
                captured = command;
                return {response: {}};
            },
        } as never);
        await controller.put('payerfsp', 'transfer-1', plainToInstance(PutSendMoneyRequest, input));
        assert.ok(captured);
        return captured.input.extensionList;
    }

    // Normalization belongs at command dispatch; the DTO preserves both public input shapes.
    for (const wrapped of [false, true]) {
        it(`accepts ${wrapped ? 'legacy FSPIOP objects' : 'documented SDK arrays'} without changing the input`, async () => {
            const extension = [{key: 'audit', value: 'one'}, {key: 'payerProvidedPayerFee', value: '5'}];
            const input = {acceptQuote: true, extensionList: wrapped ? {extension} : extension};
            const before = structuredClone(input);
            const result = await dispatch(input);
            assert.deepEqual(result, {extension: [
                {key: 'audit', value: 'one'}, {key: 'payerProvidedPayerFee', value: '5'},
            ]});
            assert.deepEqual(input, before);
        });
    }
    it('treats an empty SDK extension array as absent', async () => {
        assert.equal(await dispatch({acceptQuote: true, extensionList: []}), undefined);
    });
});
