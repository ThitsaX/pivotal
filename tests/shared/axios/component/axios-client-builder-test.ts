import * as assert from 'node:assert/strict';
import * as http from 'http';
import * as https from 'https';
import { describe, it } from 'node:test';
import { AxiosHeaders, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { AxiosClientBuilder } from '../../../../packages/shared/axios/component/axios-client-builder';
import { Ca } from '../../../../packages/shared/security/component/cert/ca';
import { CaCert } from '../../../../packages/shared/security/component/cert/ca-cert';
import { CaStore } from '../../../../packages/shared/security/component/cert/ca-store';
import { ClientCert } from '../../../../packages/shared/security/component/cert/client-cert';
import { ClientCertStore } from '../../../../packages/shared/security/component/cert/client-cert-store';
import { TEST_CERT_PEM, TEST_PRIVATE_KEY_PEM } from '../../security/component/cert/test-cert-fixtures';

class StubCaStore extends CaStore {

    private combined: Ca | undefined;

    constructor(private readonly certs: CaCert[]) {
        super();
    }

    load(): CaStore {
        if (this.certs.length === 0) {
            return this;
        }

        this.combined = Ca.fromBuffer(Buffer.concat(this.certs.map((cert) => cert.toBuffer())));

        return this;
    }

    get(): Ca | undefined {
        return this.combined;
    }
}

class StubClientCertStore extends ClientCertStore {

    constructor(private readonly clientCert: ClientCert | undefined) {
        super();
    }

    load(): ClientCertStore {
        return this;
    }

    get(): ClientCert | undefined {
        return this.clientCert;
    }
}

describe('AxiosClientBuilder', () => {

    it('should apply default headers and custom request interceptors', async () => {
        const client = AxiosClientBuilder.newBuilder()
            .withDefaultHeaders({ 'x-default': 'default-value' })
            .withRequestInterceptor((config: InternalAxiosRequestConfig) => {
                config.headers = AxiosClientBuilderTest.mergeHeaders(config.headers, {
                    'x-interceptor': 'enabled',
                });

                return config;
            })
            .withDefaults({
                adapter: async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => ({
                    data: AxiosClientBuilderTest.toPlainHeaders(config.headers),
                    status: 200,
                    statusText: 'OK',
                    headers: {},
                    config,
                }),
            })
            .build();

        const response = await client.get('/payments', {
            headers: {
                'x-call': 'call-value',
            },
        });

        const headers = response.data as Record<string, string>;

        assert.equal(headers['x-default'], 'default-value');
        assert.equal(headers['x-interceptor'], 'enabled');
        assert.equal(headers['x-call'], 'call-value');
    });

    it('should build mTLS https agent from security stores', () => {
        const caStore = new StubCaStore([
            CaCert.fromBuffer(Buffer.from(TEST_CERT_PEM, 'utf-8')),
        ]);
        const clientCertStore = new StubClientCertStore(
            ClientCert.fromBuffers(
                Buffer.from(TEST_CERT_PEM, 'utf-8'),
                Buffer.from(TEST_PRIVATE_KEY_PEM, 'utf-8'),
            ),
        );

        caStore.load();
        clientCertStore.load();

        const client = AxiosClientBuilder.newBuilder()
            .withConnectionTimeoutMs(4321)
            .withMutualTlsFromStores({
                caStore,
                clientCertStore,
                rejectUnauthorized: false,
            })
            .build();

        const httpsAgent = client.defaults.httpsAgent as https.Agent;
        const agentOptions = (httpsAgent as unknown as { options: https.AgentOptions }).options;

        assert.ok(httpsAgent instanceof https.Agent);
        assert.equal(Buffer.isBuffer(agentOptions.ca as Buffer), true);
        assert.equal(Buffer.isBuffer(agentOptions.cert as Buffer), true);
        assert.equal(Buffer.isBuffer(agentOptions.key as Buffer), true);
        assert.equal(agentOptions.timeout, 4321);
        assert.equal(agentOptions.rejectUnauthorized, false);
    });

    it('should build default agents when connection timeout is configured', () => {
        const client = AxiosClientBuilder.newBuilder()
            .withParams({
                connectionTimeoutMs: 1234,
                verifyServerCertificate: false,
                verifyDomain: false,
            })
            .build();

        const httpsAgent = client.defaults.httpsAgent as https.Agent;
        const agentOptions = (httpsAgent as unknown as { options: https.AgentOptions }).options;

        assert.ok(client.defaults.httpAgent instanceof http.Agent);
        assert.ok(httpsAgent instanceof https.Agent);
        assert.equal(agentOptions.rejectUnauthorized, false);
        assert.equal(typeof agentOptions.checkServerIdentity, 'function');
    });

    it('should apply http logger interceptor when enabled', async () => {
        const client = AxiosClientBuilder.newBuilder()
            .withHttpLogger(true)
            .withDefaults({
                adapter: async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => ({
                    data: 'ok',
                    status: 200,
                    statusText: 'OK',
                    headers: {},
                    config,
                }),
            })
            .build();

        const response = await client.get('/health');
        const metadata = AxiosClientBuilderTest.resolveMetadata(response.config);

        assert.ok(metadata != null);
        assert.equal(typeof metadata?.startedAt, 'number');
    });

    it('should not apply http logger interceptor when disabled', async () => {
        const client = AxiosClientBuilder.newBuilder()
            .withHttpLogger(false)
            .withDefaults({
                adapter: async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => ({
                    data: 'ok',
                    status: 200,
                    statusText: 'OK',
                    headers: {},
                    config,
                }),
            })
            .build();

        const response = await client.get('/health');
        const metadata = AxiosClientBuilderTest.resolveMetadata(response.config);

        assert.equal(metadata, undefined);
    });
});

class AxiosClientBuilderTest {

    static resolveMetadata(
        config: InternalAxiosRequestConfig,
    ): { startedAt: number } | undefined {
        return (config as InternalAxiosRequestConfig & { metadata?: { startedAt: number } }).metadata;
    }

    static mergeHeaders(
        headers: InternalAxiosRequestConfig['headers'],
        incoming: Record<string, string>,
    ): AxiosHeaders {
        const axiosHeaders = AxiosHeaders.from(headers ?? {});

        for (const [key, value] of Object.entries(incoming)) {
            axiosHeaders.set(key, value);
        }

        return axiosHeaders;
    }

    static toPlainHeaders(
        headers: InternalAxiosRequestConfig['headers'],
    ): Record<string, string> {
        const axiosHeaders = AxiosHeaders.from(headers ?? {});
        const json = axiosHeaders.toJSON();
        const result: Record<string, string> = {};

        for (const [key, value] of Object.entries(json)) {
            if (value != null && typeof value !== 'boolean') {
                result[key] = String(value);
            }
        }

        return result;
    }
}
