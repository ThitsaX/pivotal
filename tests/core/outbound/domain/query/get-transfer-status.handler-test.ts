import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {GetTransferStatusHandler} from '../../../../../packages/core/outbound/domain/query/get-transfer-status.handler';
import {GetTransferStatusQuery} from '../../../../../packages/core/outbound/domain/query/get-transfer-status.query';
import {StateEnum} from '../../../../../packages/core/outbound/domain/dto';
import {
    Currency,
    FspiopErrors,
    FspiopException,
    TransferState,
} from '../../../../../packages/shared/fspiop';

const TRANSFER_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const STARTED_AT = new Date('2026-08-25T09:12:31.204Z');

function handlerFor(record: Record<string, unknown> | null): GetTransferStatusHandler {
    return new GetTransferStatusHandler({
        async get(): Promise<Record<string, unknown> | null> {
            return record;
        },
    } as never);
}

function query(source = 'wallet1'): GetTransferStatusQuery {
    return new GetTransferStatusQuery(
        new GetTransferStatusQuery.Input(TRANSFER_ID, source),
    );
}

function baseRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        payerFsp: 'wallet1',
        payeeFsp: 'wallet2',
        payerHomeTransactionId: 'payer-home-1',
        payeeHomeTransactionId: 'payee-home-1',
        quotingCurrency: Currency.Usd,
        quotingAmount: '10000.0000',
        transferState: null,
        flow: null,
        transactionStartedAt: STARTED_AT,
        error: false,
        possibleDispute: false,
        partiesError: null,
        quotesRequestedAt: null,
        quotesError: null,
        transfersRequestedAt: null,
        transfersError: null,
        patchError: null,
        ...overrides,
    };
}

describe('GetTransferStatusHandler', () => {
    it('returns exactly the eight SQL-backed response fields to the payer', async () => {
        const handler = handlerFor(baseRecord({
            transferState: TransferState.Committed,
        }));

        const output = await handler.execute(query());

        assert.deepEqual(JSON.parse(JSON.stringify(output)), {
            transferId: TRANSFER_ID,
            homeTransactionId: 'payer-home-1',
            currentState: StateEnum.Completed,
            possibleDispute: false,
            amount: '10000',
            currency: Currency.Usd,
            initiatedTimestamp: STARTED_AT.toISOString(),
            errorInformation: null,
        });
    });

    it('returns the payee home transaction ID with the same outcome', async () => {
        const output = await handlerFor(baseRecord({
            transferState: TransferState.Committed,
        })).execute(query('wallet2'));

        assert.equal(output.homeTransactionId, 'payee-home-1');
        assert.equal(output.currentState, StateEnum.Completed);
    });

    it('returns an aborted outcome with normalized errorInformation', async () => {
        const output = await handlerFor(baseRecord({
            quotingAmount: '10.0000',
            error: true,
            partiesError: {
                errorInformation: {
                    errorCode: '3204',
                    errorDescription: 'Payee party could not be resolved.',
                },
            },
        })).execute(query());

        assert.equal(output.currentState, StateEnum.Aborted);
        assert.equal(output.amount, '10');
        assert.equal(output.errorInformation?.statusCode, '3204');
        assert.equal(
            output.errorInformation?.detailedDescription,
            'Payee party could not be resolved.',
        );
    });

    it('derives waiting and pending states from flow progress', async () => {
        const cases: Array<[Record<string, unknown>, StateEnum]> = [
            [{flow: 1}, StateEnum.WaitingForPartyAcceptance],
            [{flow: '1'}, StateEnum.WaitingForPartyAcceptance],
            [{flow: 2}, StateEnum.WaitingForQuoteAcceptance],
            [{flow: 1, quotesRequestedAt: new Date()}, StateEnum.Pending],
            [{flow: 2, transfersRequestedAt: new Date()}, StateEnum.Pending],
            [{flow: 3}, StateEnum.Pending],
            [{flow: null}, StateEnum.Pending],
        ];

        for (const [record, expected] of cases) {
            const output = await handlerFor(baseRecord(record)).execute(query());
            assert.equal(output.currentState, expected);
        }
    });

    it('keeps a later COMMITTED outcome authoritative over a sticky timeout error', async () => {
        const output = await handlerFor(baseRecord({
            transferState: TransferState.Committed,
            error: true,
            transfersError: {
                errorInformation: {
                    errorCode: '2004',
                    errorDescription: 'Callback timed out before the commit arrived.',
                },
            },
        })).execute(query());

        assert.equal(output.currentState, StateEnum.Completed);
        assert.equal(output.errorInformation, null);
    });

    it('returns possibleDispute independently of the final transfer state', async () => {
        const output = await handlerFor(baseRecord({
            transferState: TransferState.Committed,
            error: true,
            possibleDispute: 1,
            patchError: 'Payee notification failed.',
        })).execute(query());

        assert.equal(output.currentState, StateEnum.Completed);
        assert.equal(output.possibleDispute, true);
        assert.equal(output.errorInformation, null);
    });

    it('returns an identical not-found error for unknown and unauthorized transfers', async () => {
        const errors: Array<FspiopException> = [];

        for (const handler of [handlerFor(null), handlerFor(baseRecord())]) {
            try {
                await handler.execute(query('another-fsp'));
                assert.fail('Expected transfer lookup to fail.');
            } catch (error) {
                assert.ok(error instanceof FspiopException);
                errors.push(error);
            }
        }

        assert.equal(errors[0].errorDefinition.errorType.code, FspiopErrors.TRANSFER_ID_NOT_FOUND.errorType.code);
        assert.equal(errors[1].errorDefinition.errorType.code, FspiopErrors.TRANSFER_ID_NOT_FOUND.errorType.code);
        assert.equal(errors[0].message, errors[1].message);
    });

    it('returns a generic error when no error payload was persisted', async () => {
        const output = await handlerFor(baseRecord({
            error: true,
        })).execute(query());

        assert.equal(output.errorInformation?.statusCode, FspiopErrors.GENERIC_SERVER_ERROR.errorType.code);
    });

    // The raw DECIMAL(34,4) column is what the DFSP reconciles against the amount it
    // sent on POST /sendmoney, so the trailing scale has to come off without a Number
    // round trip - 30 integer digits do not survive one.
    it('normalizes the raw DECIMAL column back to the amount the payer sent', async () => {
        const cases: Array<[unknown, string | null]> = [
            ['10000.0000', '10000'],
            ['150.5000', '150.5'],
            ['150.5500', '150.55'],
            ['0.0001', '0.0001'],
            ['0.0000', '0'],
            ['123456789012345678901234567890.1200', '123456789012345678901234567890.12'],
            [10000, '10000'],
            [null, null],
            ['not-a-number', null],
            [Number.NaN, null],
        ];

        for (const [quotingAmount, expected] of cases) {
            const output = await handlerFor(baseRecord({quotingAmount})).execute(query());
            assert.equal(output.amount, expected, `quotingAmount ${String(quotingAmount)}`);
        }
    });
});
