import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {AxiosError} from 'axios';
import {CentralLedgerAxios} from '../../../../packages/shared/central-ledger/component/central-ledger-axios';
import {CentralLedgerException} from '../../../../packages/shared/central-ledger/exception/central-ledger-exception';

function toCentralLedgerException(error: AxiosError): CentralLedgerException {
    const source = CentralLedgerAxios as unknown as Record<string, unknown>;
    const mapper = source['toCentralLedgerException'] as ((axiosError: AxiosError) => CentralLedgerException) | undefined;

    if (mapper == null) {
        throw new Error('Failed to access CentralLedgerAxios.toCentralLedgerException for test.');
    }

    return mapper(error);
}

describe('CentralLedgerAxios', () => {

    it('should use nested errorInformation code and description from central ledger responses', () => {
        const axiosError = new AxiosError('Request failed with status code 400', 'ERR_BAD_REQUEST');
        (axiosError as AxiosError & {response: unknown}).response = {
            status: 400,
            data: {
                errorInformation: {
                    errorCode: '3003',
                    errorDescription: 'Add Party information error - Hub reconciliation account for the specified currency does not exist',
                },
            },
        } as never;

        const exception = toCentralLedgerException(axiosError);

        assert.equal(exception.code, '3003');
        assert.equal(exception.description, 'Add Party information error - Hub reconciliation account for the specified currency does not exist');
        assert.equal(exception.message, 'Add Party information error - Hub reconciliation account for the specified currency does not exist');
    });

    it('should preserve transport error descriptions for communication failures', () => {
        const axiosError = new AxiosError('connect ECONNREFUSED 127.0.0.1:3000', 'ECONNREFUSED');

        const exception = toCentralLedgerException(axiosError);

        assert.equal(exception.code, 'CENTRAL_LEDGER_COMMUNICATION_ERROR');
        assert.equal(exception.description.includes('ECONNREFUSED'), true);
    });
});
