import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {SendMoneyResponseMapper} from '../../../../../packages/core/outbound/domain/command/send-money-response.mapper';
import {TransferRequest} from '../../../../../packages/core/outbound/domain/cache';
import {StateEnum} from '../../../../../packages/core/outbound/domain/dto';
import {
    AmountType,
    Currency,
    Extension,
    ExtensionList,
    TransactionScenario,
    TransferState,
} from '../../../../../packages/shared/fspiop';

function makeTransferRequest(): TransferRequest {
    const transferRequest = new TransferRequest();
    transferRequest.transferId = '01KSQHB2KXVR6T48Z24TZBX5AY';
    transferRequest.homeTransactionId = 'home-txn-001';
    transferRequest.amount = '10';
    transferRequest.amountType = AmountType.Send;
    transferRequest.currency = Currency.Usd;
    transferRequest.transactionType = TransactionScenario.Transfer;
    transferRequest.subScenario = 'PERSON_TO_PERSON';
    transferRequest.initiatedTimestamp = '2026-05-28T14:55:43.230Z';
    transferRequest.supportedCurrencies = ['USD', 'LRD'];
    return transferRequest;
}

function makeExtension(key: string, value: string): Extension {
    const ext = new Extension();
    ext.key = key;
    ext.value = value;
    return ext;
}

function makeExtensionList(extensions: Array<Extension>): ExtensionList {
    const extensionList = new ExtensionList();
    extensionList.extension = extensions;
    return extensionList;
}

describe('SendMoneyResponseMapper', () => {

    describe('toWaitingForPartyAcceptance (POST /sendmoney)', () => {

        it('returns "0" for the three fee fields when no extension list is available', () => {
            const response = SendMoneyResponseMapper.toWaitingForPartyAcceptance(makeTransferRequest());

            assert.equal(response.currentState, StateEnum.WaitingForPartyAcceptance);
            assert.equal(response.payeeFee, '0');
            assert.equal(response.payerFee, '0');
            assert.equal(response.schemeFee, '0');
            assert.equal(response.extensionList, undefined);
        });

        it('copies common fields from the transfer request', () => {
            const transferRequest = makeTransferRequest();
            const response = SendMoneyResponseMapper.toWaitingForPartyAcceptance(transferRequest);

            assert.equal(response.transferId, transferRequest.transferId);
            assert.equal(response.homeTransactionId, transferRequest.homeTransactionId);
            assert.equal(response.amount, transferRequest.amount);
            assert.equal(response.currency, transferRequest.currency);
            assert.equal(response.direction, 'OUTGOING');
        });
    });

    describe('toWaitingForQuoteAcceptance (PUT acceptParty)', () => {

        it('populates fee fields from extension list values', () => {
            const extensionList = makeExtensionList([
                makeExtension('payeeFee',  '1.99'),
                makeExtension('payerFee',  '2.99'),
                makeExtension('schemeFee', '1.34'),
            ]);

            const response = SendMoneyResponseMapper.toWaitingForQuoteAcceptance(
                makeTransferRequest(),
                '1.99',
                extensionList,
            );

            assert.equal(response.currentState, StateEnum.WaitingForQuoteAcceptance);
            assert.equal(response.payeeFspFeeAmount, '1.99');
            assert.equal(response.payeeFee, '1.99');
            assert.equal(response.payerFee, '2.99');
            assert.equal(response.schemeFee, '1.34');
        });

        it('looks up keys case-insensitively', () => {
            const extensionList = makeExtensionList([
                makeExtension('PayeeFee',  '1.99'),
                makeExtension('PAYERFEE',  '2.99'),
                makeExtension('schemefee', '1.34'),
            ]);

            const response = SendMoneyResponseMapper.toWaitingForQuoteAcceptance(
                makeTransferRequest(),
                undefined,
                extensionList,
            );

            assert.equal(response.payeeFee, '1.99');
            assert.equal(response.payerFee, '2.99');
            assert.equal(response.schemeFee, '1.34');
        });

        it('trims surrounding whitespace from key and value', () => {
            const extensionList = makeExtensionList([
                makeExtension('  payeeFee  ',  '  1.99  '),
                makeExtension(' payerFee ',    '2.99'),
                makeExtension('schemeFee',     ' 1.34'),
            ]);

            const response = SendMoneyResponseMapper.toWaitingForQuoteAcceptance(
                makeTransferRequest(),
                undefined,
                extensionList,
            );

            assert.equal(response.payeeFee, '1.99');
            assert.equal(response.payerFee, '2.99');
            assert.equal(response.schemeFee, '1.34');
        });

        it('falls back to "0" for missing keys', () => {
            const extensionList = makeExtensionList([
                makeExtension('payeeFee', '1.99'),
            ]);

            const response = SendMoneyResponseMapper.toWaitingForQuoteAcceptance(
                makeTransferRequest(),
                undefined,
                extensionList,
            );

            assert.equal(response.payeeFee, '1.99');
            assert.equal(response.payerFee, '0');
            assert.equal(response.schemeFee, '0');
        });

        it('falls back to "0" when the extension value is empty or whitespace', () => {
            const extensionList = makeExtensionList([
                makeExtension('payeeFee',  ''),
                makeExtension('payerFee',  '   '),
                makeExtension('schemeFee', '1.34'),
            ]);

            const response = SendMoneyResponseMapper.toWaitingForQuoteAcceptance(
                makeTransferRequest(),
                undefined,
                extensionList,
            );

            assert.equal(response.payeeFee, '0');
            assert.equal(response.payerFee, '0');
            assert.equal(response.schemeFee, '1.34');
        });

        it('returns all "0" fees when the extension list is undefined', () => {
            const response = SendMoneyResponseMapper.toWaitingForQuoteAcceptance(
                makeTransferRequest(),
                undefined,
                undefined,
            );

            assert.equal(response.payeeFee, '0');
            assert.equal(response.payerFee, '0');
            assert.equal(response.schemeFee, '0');
        });

        it('passes the raw extension array through on the response', () => {
            const extensions = [makeExtension('payeeFee', '1.99')];
            const response = SendMoneyResponseMapper.toWaitingForQuoteAcceptance(
                makeTransferRequest(),
                undefined,
                makeExtensionList(extensions),
            );

            assert.deepEqual(response.extensionList, extensions);
        });
    });

    describe('toFinalState (PUT acceptQuote)', () => {

        it('populates fee fields from extension list values on Committed state', () => {
            const extensionList = makeExtensionList([
                makeExtension('payeeFee',  '1.99'),
                makeExtension('payerFee',  '2.99'),
                makeExtension('schemeFee', '1.34'),
            ]);

            const response = SendMoneyResponseMapper.toFinalState(
                makeTransferRequest(),
                TransferState.Committed,
                extensionList,
            );

            assert.equal(response.currentState, StateEnum.Completed);
            assert.equal(response.payeeFee, '1.99');
            assert.equal(response.payerFee, '2.99');
            assert.equal(response.schemeFee, '1.34');
        });

        it('maps TransferState.Aborted to StateEnum.Aborted and still emits fees', () => {
            const extensionList = makeExtensionList([
                makeExtension('payeeFee', '1.99'),
            ]);

            const response = SendMoneyResponseMapper.toFinalState(
                makeTransferRequest(),
                TransferState.Aborted,
                extensionList,
            );

            assert.equal(response.currentState, StateEnum.Aborted);
            assert.equal(response.payeeFee, '1.99');
            assert.equal(response.payerFee, '0');
            assert.equal(response.schemeFee, '0');
        });
    });
});
