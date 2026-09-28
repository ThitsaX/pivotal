import 'reflect-metadata';
import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {TransferStatusController} from '../../../../packages/apps/web-outbound/controllers/transfer-status.controller';
import {GetTransferStatusQuery, StateEnum} from '../../../../packages/core/outbound/domain';
import {FspiopErrors, FspiopException} from '../../../../packages/shared/fspiop';

const TRANSFER_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';

describe('TransferStatusController', () => {
    it('queries status with the validated transfer ID and caller FSP', async () => {
        let dispatched: GetTransferStatusQuery | undefined;
        const response = {
            transferId: TRANSFER_ID,
            homeTransactionId: 'payer-home-1',
            currentState: StateEnum.Completed,
        } as GetTransferStatusQuery.Output;
        const controller = new TransferStatusController({
            async execute(query: GetTransferStatusQuery): Promise<GetTransferStatusQuery.Output> {
                dispatched = query;
                return response;
            },
        } as never);

        const output = await controller.get(' wallet1 ', TRANSFER_ID);

        assert.equal(output, response);
        assert.equal(dispatched?.input.transferId, TRANSFER_ID);
        assert.equal(dispatched?.input.requesterFspId, 'wallet1');
    });

    it('requires fspiop-source even when called without the global guard', async () => {
        const controller = new TransferStatusController({} as never);

        await assert.rejects(
            () => controller.get(' ', TRANSFER_ID),
            (error: unknown) => error instanceof FspiopException
                && error.errorDefinition.errorType.code
                === FspiopErrors.MISSING_MANDATORY_ELEMENT.errorType.code,
        );
    });

    it('returns a clear error when transferId is omitted from the route', () => {
        const controller = new TransferStatusController({} as never);

        assert.throws(
            () => controller.getWithoutTransferId(),
            (error: unknown) => error instanceof FspiopException
                && error.message === 'transferId path parameter is required.',
        );
    });

    it('accepts a canonical ULID and rejects malformed transfer IDs with 3101', async () => {
        const controller = new TransferStatusController({
            async execute(): Promise<GetTransferStatusQuery.Output> {
                return {} as GetTransferStatusQuery.Output;
            },
        } as never);

        await assert.doesNotReject(() => controller.get('wallet1', TRANSFER_ID));

        for (const transferId of [
            TRANSFER_ID.toLowerCase(),
            '910fd800-43e3-49bd-a359-49267b318087',
            '81ARZ3NDEKTSV4RRFFQ69G5FAV',
            `${TRANSFER_ID}0`,
        ]) {
            await assert.rejects(
                () => controller.get('wallet1', transferId),
                (error: unknown) => error instanceof FspiopException
                    && error.errorDefinition.errorType.code
                    === FspiopErrors.MALFORMED_SYNTAX.errorType.code,
            );
        }
    });
});
