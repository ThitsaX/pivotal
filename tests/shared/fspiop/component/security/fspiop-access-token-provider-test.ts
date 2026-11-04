import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {AxiosError, AxiosHeaders, AxiosInstance, InternalAxiosRequestConfig} from 'axios';
import {FspiopAccessTokenProvider, FspiopBearerTokenInterceptor} from '../../../../../packages/shared/fspiop';

const SETTINGS: FspiopAccessTokenProvider.Settings = {
    tokenUrl: 'https://idp.example/token',
    clientId: 'pivotal',
    clientSecret: 'very-secret',
};

type TokenResponse = { access_token?: string; expires_in?: number };

/** An axios stand-in that answers token requests from a script and records what it was sent. */
function fakeClient(respond: (call: number) => Promise<TokenResponse>): { client: AxiosInstance; calls: string[] } {
    const calls: string[] = [];
    const client = {
        post: async (_url: string, body: string) => {
            calls.push(body);
            return {data: await respond(calls.length)};
        },
    } as unknown as AxiosInstance;

    return {client, calls};
}

describe('FspiopAccessTokenProvider', () => {

    it('sends the client-credentials grant and returns the token', async () => {
        const {client, calls} = fakeClient(async () => ({access_token: 'tok-1', expires_in: 300}));
        const provider = new FspiopAccessTokenProvider(SETTINGS, client);

        assert.equal(await provider.accessToken(), 'tok-1');

        const sent = new URLSearchParams(calls[0]);
        assert.equal(sent.get('grant_type'), 'client_credentials');
        assert.equal(sent.get('client_id'), 'pivotal');
        assert.equal(sent.get('client_secret'), 'very-secret');
    });

    it('reuses a cached token until it nears expiry', async () => {
        const {client, calls} = fakeClient(async (n) => ({access_token: `tok-${n}`, expires_in: 300}));
        const provider = new FspiopAccessTokenProvider(SETTINGS, client);

        await provider.accessToken();
        assert.equal(await provider.accessToken(), 'tok-1');
        assert.equal(calls.length, 1);
    });

    it('shares one refresh between concurrent requests', async () => {
        let release!: () => void;
        const gate = new Promise<void>((resolve) => { release = resolve; });
        const {client, calls} = fakeClient(async (n) => {
            await gate;
            return {access_token: `tok-${n}`, expires_in: 300};
        });
        const provider = new FspiopAccessTokenProvider(SETTINGS, client);

        const all = Promise.all(Array.from({length: 20}, () => provider.accessToken()));
        release();

        assert.deepEqual(new Set(await all), new Set(['tok-1']));
        assert.equal(calls.length, 1);
    });

    it('refetches after invalidate', async () => {
        const {client, calls} = fakeClient(async (n) => ({access_token: `tok-${n}`, expires_in: 300}));
        const provider = new FspiopAccessTokenProvider(SETTINGS, client);

        await provider.accessToken();
        provider.invalidate();

        assert.equal(await provider.accessToken(), 'tok-2');
        assert.equal(calls.length, 2);
    });

    it('still reuses a token whose lifetime is shorter than the refresh margin', async () => {
        const {client, calls} = fakeClient(async (n) => ({access_token: `tok-${n}`, expires_in: 10}));
        const provider = new FspiopAccessTokenProvider(SETTINGS, client);

        await provider.accessToken();
        await provider.accessToken();
        assert.equal(calls.length, 1);
    });

    it('fails without exposing the client secret', async () => {
        const failure = new AxiosError('Request failed with status code 401', 'ERR_BAD_REQUEST',
            {data: 'client_secret=very-secret'} as InternalAxiosRequestConfig,
            undefined,
            {status: 401} as never);
        const {client} = fakeClient(async () => { throw failure; });
        const provider = new FspiopAccessTokenProvider(SETTINGS, client);

        await assert.rejects(provider.accessToken(), (error: unknown) => {
            assert.ok(error instanceof Error);
            assert.notEqual(error, failure);
            assert.match(error.message, /HTTP 401/);
            assert.doesNotMatch(JSON.stringify(error) + error.message, /very-secret/);
            return true;
        });
    });

    it('rejects a response with no token', async () => {
        const {client} = fakeClient(async () => ({}));
        const provider = new FspiopAccessTokenProvider(SETTINGS, client);

        await assert.rejects(provider.accessToken(), /No access_token/);
    });
});

describe('FspiopBearerTokenInterceptor', () => {

    it('adds the bearer token to the request', async () => {
        const {client} = fakeClient(async () => ({access_token: 'tok-1', expires_in: 300}));
        const interceptor = new FspiopBearerTokenInterceptor(new FspiopAccessTokenProvider(SETTINGS, client)).build();

        const config = await interceptor({headers: new AxiosHeaders()} as InternalAxiosRequestConfig);

        assert.equal(config.headers['Authorization'], 'Bearer tok-1');
    });
});
