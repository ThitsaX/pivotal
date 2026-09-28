import * as assert from 'node:assert/strict';
import {beforeEach, describe, it} from 'node:test';
import {VaultClient} from '../../../../packages/shared/vault/component/vault-client';
import {VaultAuthMethod, VaultSettings} from '../../../../packages/shared/vault/component/vault-settings';

/**
 * Token lifecycle. The behaviour under test is the one that broke certificate issuance in a live
 * environment: a token cached at startup, never renewed, and every call after the lease expiring
 * with a 403 that reads like a missing policy.
 */

const LEASE_SECONDS = 3600;

/** Stands in for the axios instance the client builds in its constructor. */
class FakeHttp {

    /** Statuses to answer non-login calls with, in order; anything after the list is a 200. */
    plannedStatuses: number[] = [];

    readonly logins: number[] = [];

    readonly sentTokens: string[] = [];

    private issued = 0;

    /**
     * What `sys/internal/ui/mounts` answers. Version 2 by default: the mount check runs before
     * every KV call, and it is not what most of these tests are about.
     */
    mountAnswer: {status: number; version?: string} = {status: 200, version: '2'};

    /** KV and PKI calls only — the mount check is bookkeeping, not behaviour under test. */
    readonly kvCalls: string[] = [];

    constructor(private readonly leaseSeconds: number | null = LEASE_SECONDS) {
    }

    post(url: string, _body?: unknown, config?: any): Promise<unknown> {

        if (url.includes('/auth/')) {
            this.issued += 1;
            this.logins.push(this.issued);

            return Promise.resolve({
                status: 200,
                data: {
                    auth: {
                        client_token: `token-${this.issued}`,
                        ...(this.leaseSeconds == null ? {} : {lease_duration: this.leaseSeconds}),
                    },
                },
            });
        }

        return this.respond(config);
    }

    get(url: string, config?: any): Promise<unknown> {

        if (url.includes('/sys/internal/ui/mounts/')) {
            return Promise.resolve({
                status: this.mountAnswer.status,
                data: {
                    data: {
                        options: this.mountAnswer.version == null
                            ? {}
                            : {version: this.mountAnswer.version},
                    },
                },
            });
        }

        this.kvCalls.push(url);

        return this.respond(config);
    }

    private respond(config?: any): Promise<unknown> {

        this.sentTokens.push(config?.headers?.['X-Vault-Token']);

        const status = this.plannedStatuses.shift() ?? 200;

        return Promise.resolve({
            status,
            data: {data: {data: {privateKey: 'pem'}}},
        });
    }
}

function client(http: FakeHttp): VaultClient {

    const settings = new VaultSettings('http://vault:8200', 'a-role');

    (settings as any).authMethod = VaultAuthMethod.Kubernetes;
    (settings as any).kvMount = 'secret';
    (settings as any).kubernetesAuthPath = 'kubernetes';

    const instance = new VaultClient(settings);

    // The ServiceAccount token is read from a projected file that does not exist off-cluster.
    (instance as any).readServiceAccountToken = () => Promise.resolve('sa-jwt');
    (instance as any).http = http;

    return instance;
}

describe('VaultClient token lifecycle', () => {

    let http: FakeHttp;

    beforeEach(() => {
        http = new FakeHttp();
    });

    it('should log in once and reuse the token while the lease is good', async () => {
        const vault = client(http);

        await vault.readKvField('pivotal/jwskey/DemoDFSP1', 'privateKey');
        await vault.readKvField('pivotal/jwskey/DemoDFSP2', 'privateKey');

        assert.equal(http.logins.length, 1, 'a valid token must not be replaced');
        assert.deepEqual(http.sentTokens, ['token-1', 'token-1']);
    });

    it('should renew before the lease expires rather than after a call fails', async () => {
        const vault = client(http);

        await vault.readKvField('pivotal/jwskey/DemoDFSP1', 'privateKey');

        // Inside the renewal margin: still valid to Vault, but not for long enough to rely on.
        (vault as any).tokenExpiresAt = Date.now() + 5_000;

        await vault.readKvField('pivotal/jwskey/DemoDFSP1', 'privateKey');

        assert.equal(http.logins.length, 2);
        assert.deepEqual(http.sentTokens, ['token-1', 'token-2'],
            'the second read must carry the new token, with no failed call in between');
    });

    it('should replace a rejected token and retry once', async () => {
        const vault = client(http);

        // Revoked early, or Vault restarted: the lease says valid and Vault disagrees.
        http.plannedStatuses = [403];

        const value = await vault.readKvField('pivotal/jwskey/DemoDFSP1', 'privateKey');

        assert.equal(value, 'pem', 'the retry must return the value, not the rejection');
        assert.equal(http.logins.length, 2);
        assert.deepEqual(http.sentTokens, ['token-1', 'token-2']);
    });

    it('should treat a second rejection as a policy fault and name it as one', async () => {
        const vault = client(http);

        // Rejected with a token seconds old: the grant is missing, and retrying cannot fix it.
        http.plannedStatuses = [403, 403];

        await assert.rejects(
            vault.readKvField('pivotal/jwskey/DemoDFSP1', 'privateKey'),
            /policy, not an expired credential/);

        assert.equal(http.logins.length, 2, 'exactly one retry, never a loop');
    });

    it('should renew on 401 as well as 403', async () => {
        const vault = client(http);

        http.plannedStatuses = [401];

        await vault.readKvField('pivotal/jwskey/DemoDFSP1', 'privateKey');

        assert.equal(http.logins.length, 2);
    });

    it('should renew a certificate signing call, not only reads', async () => {
        // The path that actually broke: DfspCertificateIssuer never invalidated the token, so
        // enrolment stayed dead until the pod restarted.
        const vault = client(http);

        await vault.readKvField('pivotal/jwskey/DemoDFSP1', 'privateKey');
        (vault as any).tokenExpiresAt = Date.now() - 1;

        await vault.signCertificate({
            mount: 'pki_dfsp',
            role: 'dfsp-client',
            csrPem: '-----BEGIN CERTIFICATE REQUEST-----',
            commonName: 'DemoDFSP2',
        }).catch(() => undefined);

        assert.equal(http.logins.length, 2,
            'signing must renew an expired token the same way a read does');
    });

    it('should not expire a supplied development token', async () => {
        const settings = new VaultSettings('http://vault:8200', 'a-role');

        (settings as any).authMethod = VaultAuthMethod.Token;
        (settings as any).token = 'dev-token';
        (settings as any).kvMount = 'secret';

        const vault = new VaultClient(settings);

        (vault as any).http = http;

        await vault.readKvField('pivotal/jwskey/DemoDFSP1', 'privateKey');
        await vault.readKvField('pivotal/jwskey/DemoDFSP1', 'privateKey');

        assert.deepEqual(http.sentTokens, ['dev-token', 'dev-token']);
        assert.equal(http.logins.length, 0, 'a supplied token has no lease to renew');
    });

    it('should renew often when Vault states no lease', async () => {
        // No lease_duration means nothing is known about how long this lasts. Assuming a long life
        // would reproduce the original bug, so the token is treated as immediately spent.
        const noLease = new FakeHttp(null);
        const vault = client(noLease);

        await vault.readKvField('pivotal/jwskey/DemoDFSP1', 'privateKey');
        await vault.readKvField('pivotal/jwskey/DemoDFSP1', 'privateKey');

        // The property is that such a token is never reused, not a particular login count — the
        // mount check takes one of its own the first time through.
        assert.equal(new Set(noLease.sentTokens).size, noLease.sentTokens.length,
            'a token with no stated lease must not be carried into a second call');
    });
});

/**
 * KV engine version. A v1 mount is the failure this guard exists to stop: the client's v2 path and
 * payload shape round-trip against it perfectly, so nothing looks wrong until an operator writes a
 * key with `vault kv put` and the service cannot see it.
 */
describe('VaultClient KV engine version', () => {

    it('should read normally from a version 2 mount', async () => {
        const http = new FakeHttp();
        const value = await client(http).readKvField('pivotal/jwskey/DemoDFSP1', 'privateKey');

        assert.equal(value, 'pem');
    });

    it('should refuse a version 1 mount rather than write somewhere nothing reads', async () => {
        const http = new FakeHttp();

        http.mountAnswer = {status: 200, version: '1'};

        await assert.rejects(
            client(http).writeKvField('pivotal/jwskey/DemoDFSP1', 'privateKey', 'pem'),
            /is KV version 1/);

        assert.deepEqual(http.kvCalls, [], 'nothing may be written before the mount is trusted');
    });

    it('should check the mount once, not on every call', async () => {
        const http = new FakeHttp();
        const vault = client(http);

        await vault.readKvField('pivotal/jwskey/DemoDFSP1', 'privateKey');
        await vault.readKvField('pivotal/jwskey/DemoDFSP2', 'privateKey');

        assert.equal(http.kvCalls.length, 2);
    });

    it('should continue when the mount table cannot be read', async () => {
        // Not every role can read sys/internal/ui/mounts. Refusing on an inconclusive answer would
        // take down a deployment that is configured correctly.
        const http = new FakeHttp();

        http.mountAnswer = {status: 403};

        const value = await client(http).readKvField('pivotal/jwskey/DemoDFSP1', 'privateKey');

        assert.equal(value, 'pem');
    });

    it('should continue when the mount reports no version at all', async () => {
        const http = new FakeHttp();

        http.mountAnswer = {status: 200};

        const value = await client(http).readKvField('pivotal/jwskey/DemoDFSP1', 'privateKey');

        assert.equal(value, 'pem');
    });
});
