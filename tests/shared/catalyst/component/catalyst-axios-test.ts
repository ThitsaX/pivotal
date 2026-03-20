import * as assert from 'node:assert/strict';
import * as http from 'node:http';
import * as https from 'node:https';
import {describe, it} from 'node:test';
import {AxiosError, AxiosInstance} from 'axios';
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
});
