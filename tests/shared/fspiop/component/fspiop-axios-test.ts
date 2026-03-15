import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {FspiopAxios, FspiopAxiosError, FspiopSettings, PartyIdType} from '../../../../packages/shared/fspiop';

describe('FspiopAxios', () => {

    it('should map transport failure to destination communication error with non-empty description', async () => {
        const settings = new FspiopSettings(
            'switch',
            'http://127.0.0.1:59999',
            'http://127.0.0.1:59999',
            'http://127.0.0.1:59999',
            false,
            false,
        );
        const fspiopAxios = new FspiopAxios(settings, {
            connectionTimeoutMs: 200,
            socketTimeoutMs: 200,
        });

        await assert.rejects(
            () => fspiopAxios.getParties(settings.partiesUrl, {}, PartyIdType.Msisdn, '8000000001'),
            (error: unknown) => {
                assert.equal(FspiopAxiosError.is(error), true);

                if (FspiopAxiosError.is(error)) {
                    const info = error.errorInformationResponse.errorInformation;
                    assert.equal(info?.errorCode, '1001');
                    assert.equal((info?.errorDescription?.trim().length ?? 0) > 0, true);
                }

                return true;
            },
        );
    });
});
