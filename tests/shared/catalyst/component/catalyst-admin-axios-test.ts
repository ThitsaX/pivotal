import * as assert from 'node:assert/strict';
import * as http from 'node:http';
import * as https from 'node:https';
import {describe, it} from 'node:test';
import {AxiosError, AxiosInstance} from 'axios';
import {CatalystAdminAxios} from '../../../../packages/shared/catalyst/component/catalyst-admin-axios';
import {CatalystException} from '../../../../packages/shared/catalyst/exception/catalyst-exception';

function toCatalystException(error: AxiosError): CatalystException {
    const source = CatalystAdminAxios as unknown as Record<string, unknown>;
    const mapper = source['toCatalystException'] as ((axiosError: AxiosError) => CatalystException) | undefined;

    if (mapper == null) {
        throw new Error('Failed to access CatalystAdminAxios.toCatalystException for test.');
    }

    return mapper(error);
}

function resolveClient(catalystAdminAxios: CatalystAdminAxios): AxiosInstance {
    const source = catalystAdminAxios as unknown as {client?: AxiosInstance};
    const client = source.client;

    if (client == null) {
        throw new Error('Failed to access CatalystAdminAxios.client for test.');
    }

    return client;
}

describe('CatalystAdminAxios', () => {

    it('should apply 10-second defaults for socket and connection timeouts', () => {
        const catalystAdminAxios = new CatalystAdminAxios('http://localhost:3000');
        const client = resolveClient(catalystAdminAxios);
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

    it('should issue admin requests with encoded paths, query params, and forwarded headers', async () => {
        const calls: Array<{method: string; url: string; body?: unknown; config?: unknown}> = [];
        const client = {
            get: async (url: string, config: unknown) => {
                calls.push({method: 'GET', url, config});

                return {data: []};
            },
            post: async (url: string, body: unknown, config: unknown) => {
                calls.push({method: 'POST', url, body, config});

                return {data: {feePolicyId: '123'}};
            },
        } as unknown as AxiosInstance;

        const catalystAdminAxios = new CatalystAdminAxios(
            'http://localhost:3000',
            {},
            [],
            {'x-admin-token': 'secret'},
            client,
        );

        await catalystAdminAxios.createFeePolicy({
            name: 'Scenario Fee Policy',
        });

        await catalystAdminAxios.getPolicySchedules('scenario/id 1');
        await catalystAdminAxios.getScenario('scenario/id 1');

        assert.deepEqual(calls[0], {
            method: 'POST',
            url: 'http://localhost:3000/fee-policies/create',
            body: {name: 'Scenario Fee Policy'},
            config: {headers: {'x-admin-token': 'secret'}},
        });

        assert.deepEqual(calls[1], {
            method: 'GET',
            url: 'http://localhost:3000/scenarios/get-schedules',
            config: {
                headers: {'x-admin-token': 'secret'},
                params: {scenarioId: 'scenario/id 1'},
            },
        });

        assert.deepEqual(calls[2], {
            method: 'GET',
            url: 'http://localhost:3000/scenarios/scenario%2Fid%201',
            config: {
                headers: {'x-admin-token': 'secret'},
                params: undefined,
            },
        });
    });
});
