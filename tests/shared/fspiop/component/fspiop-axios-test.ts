import * as assert from 'node:assert/strict';
import {AxiosInstance, AxiosRequestConfig} from 'axios';
import {describe, it} from 'node:test';
import {FspiopAxios, FspiopAxiosError, FspiopHeaders, FspiopSettings, PartyIdType} from '../../../../packages/shared/fspiop';
import {ApiType} from '../../../../packages/shared/iso20022/api-type';

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

    it('should send the ISO20022 content-type on ISO20022 get parties requests', async () => {
        const settings = new FspiopSettings(
            'switch',
            'http://example.test',
            'http://example.test',
            'http://example.test',
            false,
            false,
            ApiType.ISO20022,
        );
        const headers = FspiopHeaders.Values.Parties.forRequest('trace-id', 'payerfsp', 'payeefsp');
        let capturedConfig: AxiosRequestConfig | undefined;
        const client = {
            get: async (_url: string, config?: AxiosRequestConfig) => {
                capturedConfig = config;
            },
        } as AxiosInstance;
        const fspiopAxios = new FspiopAxios(
            settings,
            {},
            [],
            {'Content-Type': 'application/json'},
            undefined,
            client,
        );

        await fspiopAxios.getParties(settings.partiesUrl, headers, PartyIdType.Msisdn, '8000000001');

        assert.equal(
            capturedConfig?.headers?.['content-type'],
            'application/vnd.interoperability.iso20022.parties+json;version=2.0',
        );
        assert.equal(capturedConfig?.headers?.['Content-Type'], undefined);
        assert.equal(
            capturedConfig?.headers?.accept,
            'application/vnd.interoperability.iso20022.parties+json;version=2.0',
        );
    });

    it('should keep ISO20022 content-type on get requests without duplicate default Content-Type', async () => {
        const settings = new FspiopSettings(
            'switch',
            'http://127.0.0.1:59999',
            'http://127.0.0.1:59999',
            'http://127.0.0.1:59999',
            false,
            false,
            ApiType.ISO20022,
        );
        let lowerContentType: unknown;
        let upperContentType: unknown;
        const fspiopAxios = new FspiopAxios(
            settings,
            {
                connectionTimeoutMs: 200,
                socketTimeoutMs: 200,
            },
            [
                (config) => {
                    lowerContentType = config.headers?.['content-type'];
                    upperContentType = config.headers?.['Content-Type'];
                    return config;
                },
            ],
            {'Content-Type': 'application/json'},
        );

        await assert.rejects(
            () => fspiopAxios.getParties(
                settings.partiesUrl,
                FspiopHeaders.Values.Parties.forRequest('trace-id', 'payerfsp', 'payeefsp'),
                PartyIdType.Msisdn,
                '8000000001',
            ),
        );

        assert.equal(
            lowerContentType ?? upperContentType,
            'application/vnd.interoperability.iso20022.parties+json;version=2.0',
        );
        assert.notEqual(upperContentType, 'application/json');
    });

    it('should keep FSPIOP content-type on get requests without duplicate default Content-Type', async () => {
        const settings = new FspiopSettings(
            'switch',
            'http://127.0.0.1:59999',
            'http://127.0.0.1:59999',
            'http://127.0.0.1:59999',
            false,
            false,
        );
        let lowerContentType: unknown;
        let upperContentType: unknown;
        const fspiopAxios = new FspiopAxios(
            settings,
            {
                connectionTimeoutMs: 200,
                socketTimeoutMs: 200,
            },
            [
                (config) => {
                    lowerContentType = config.headers?.['content-type'];
                    upperContentType = config.headers?.['Content-Type'];
                    return config;
                },
            ],
            {'Content-Type': 'application/json'},
        );

        await assert.rejects(
            () => fspiopAxios.getParties(
                settings.partiesUrl,
                FspiopHeaders.Values.Parties.forRequest('trace-id', 'payerfsp', 'payeefsp'),
                PartyIdType.Msisdn,
                '8000000001',
            ),
        );

        assert.equal(
            lowerContentType ?? upperContentType,
            'application/vnd.interoperability.parties+json;version=2.0',
        );
        assert.notEqual(upperContentType, 'application/json');
    });
});
