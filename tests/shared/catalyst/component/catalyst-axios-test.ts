import * as assert from 'node:assert/strict';
import * as http from 'node:http';
import * as https from 'node:https';
import {describe, it} from 'node:test';
import {AxiosError, AxiosInstance, AxiosResponse, InternalAxiosRequestConfig} from 'axios';
import {CatalystAxios} from '../../../../packages/shared/catalyst/component/catalyst-axios';
import {CatalystException} from '../../../../packages/shared/catalyst/exception/catalyst-exception';

function toCatalystException(error: AxiosError): CatalystException {
    const source = CatalystAxios as unknown as Record<string, unknown>;
    const mapper = source['toCatalystException'] as ((axiosError: AxiosError) => CatalystException) | undefined;

    if (mapper == null) {
        throw new Error('Failed to access CatalystAxios.toCatalystException for test.');
    }

    return mapper(error);
}

function resolveClient(catalystAxios: CatalystAxios): AxiosInstance {
    const source = catalystAxios as unknown as {client?: AxiosInstance};
    const client = source.client;

    if (client == null) {
        throw new Error('Failed to access CatalystAxios.client for test.');
    }

    return client;
}

describe('CatalystAxios', () => {

    it('should apply 10-second defaults for socket and connection timeouts', () => {
        const catalystAxios = new CatalystAxios('http://localhost:3000');
        const client = resolveClient(catalystAxios);
        const httpAgent = client.defaults.httpAgent as http.Agent;
        const httpsAgent = client.defaults.httpsAgent as https.Agent;
        const httpAgentOptions = (httpAgent as unknown as {options: {timeout?: number}}).options;
        const httpsAgentOptions = (httpsAgent as unknown as {options: {timeout?: number}}).options;

        assert.equal(client.defaults.timeout, 10_000);
        assert.ok(httpAgent instanceof http.Agent);
        assert.ok(httpsAgent instanceof https.Agent);
        assert.equal(httpAgentOptions.timeout, 10_000);
        assert.equal(httpsAgentOptions.timeout, 10_000);
    });

    it('should map transport failure to CatalystException with communication code', () => {
        const axiosError = new AxiosError('connect ECONNREFUSED 127.0.0.1:5000', 'ECONNREFUSED');
        const exception = toCatalystException(axiosError);

        assert.equal(exception.code, 'CATALYST_COMMUNICATION_ERROR');
        assert.equal(exception.message.includes('Catalyst (CATALYST_COMMUNICATION_ERROR)'), true);
        assert.equal(exception.message.includes('ECONNREFUSED'), true);
    });

    it('should distinguish timeout failures from other transport failures', () => {
        const axiosError = new AxiosError('timeout of 10000ms exceeded', 'ECONNABORTED');
        const exception = toCatalystException(axiosError);

        assert.equal(exception.code, 'CATALYST_TIMEOUT');
    });

    it('should request the current rate with the exact currency parameters', async () => {
        const responseBody = {
            baseCurrency: 'USD',
            quoteCurrency: 'LRD',
            rate: 184,
            effectiveFrom: '2026-10-05T00:00:00Z',
            updatedAt: '2026-10-05T09:00:00Z',
        };
        let requestConfig: InternalAxiosRequestConfig | undefined;
        const catalystAxios = new CatalystAxios('http://catalyst:8080');
        const client = resolveClient(catalystAxios);
        client.defaults.adapter = async (config): Promise<AxiosResponse> => {
            requestConfig = config;
            return {
                data: responseBody,
                status: 200,
                statusText: 'OK',
                headers: {},
                config,
            };
        };

        const result = await catalystAxios.getCurrentFxRate('USD', 'LRD');

        assert.equal(requestConfig?.url, 'http://catalyst:8080/rates');
        assert.deepEqual(requestConfig?.params, {
            baseCurrency: 'USD',
            quoteCurrency: 'LRD',
        });
        assert.equal(result, responseBody);
    });

    it('should fallback to Axios status message when error response body is not expected', () => {
        const axiosError = new AxiosError('Request failed with status code 500', 'ERR_BAD_RESPONSE');
        (axiosError as AxiosError & {response: unknown}).response = {
            status: 500,
            data: {foo: 'bar'},
        } as any;

        const exception = toCatalystException(axiosError);
        assert.equal(exception.code, 'CATALYST_HTTP_500');
        assert.equal(exception.message.includes('Request failed with status code 500'), true);
    });

    it('should use code and message from catalyst error response body when available', () => {
        const axiosError = new AxiosError('Request failed with status code 404', 'ERR_BAD_REQUEST');
        (axiosError as AxiosError & {response: unknown}).response = {
            status: 404,
            data: {
                code: 'FEE_POLICY_NOT_FOUND',
                message: 'Fee policy does not exist.',
            },
        } as any;

        const exception = toCatalystException(axiosError);
        assert.equal(exception.code, 'FEE_POLICY_NOT_FOUND');
        assert.equal(exception.message.includes('Fee policy does not exist.'), true);
    });

    it('should use errorCode from the current FX rate error response body', () => {
        const axiosError = new AxiosError('Request failed with status code 400', 'ERR_BAD_REQUEST');
        (axiosError as AxiosError & {response: unknown}).response = {
            status: 400,
            data: {
                errorCode: 'FX_RATE_NOT_FOUND',
                message: 'FX rate is not available for LRD/VND.',
            },
        } as any;

        const exception = toCatalystException(axiosError);
        assert.equal(exception.code, 'FX_RATE_NOT_FOUND');
        assert.equal(exception.message.includes('FX rate is not available for LRD/VND.'), true);
    });
});
