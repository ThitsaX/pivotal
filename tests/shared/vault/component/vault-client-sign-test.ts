import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {VaultClient} from '../../../../packages/shared/vault/component/vault-client';
import {VaultAuthMethod, VaultSettings} from '../../../../packages/shared/vault/component/vault-settings';

/** Records what the client posts and answers like Vault's PKI sign endpoints. */
class RecordingHttp {

    readonly posts: Array<{url: string; body: any}> = [];

    status = 200;

    post(url: string, body?: any): Promise<unknown> {

        this.posts.push({url, body});

        return Promise.resolve({
            status: this.status,
            data: {
                data: {
                    certificate: '-----BEGIN CERTIFICATE-----\nleaf\n-----END CERTIFICATE-----',
                    ca_chain: ['-----BEGIN CERTIFICATE-----\nintermediate\n-----END CERTIFICATE-----'],
                    serial_number: '0a:1b',
                    expiration: 1_800_000_000,
                },
            },
        });
    }
}

function client(http: RecordingHttp): VaultClient {

    const settings = new VaultSettings('http://vault:8200', 'a-role');

    (settings as any).authMethod = VaultAuthMethod.Token;
    (settings as any).token = 'dev-token';

    const vault = new VaultClient(settings);

    (vault as any).http = http;

    return vault;
}

const REQUEST: VaultClient.VerbatimSignRequest = {
    mount: 'pki_dfsp',
    role: 'dfsp-client',
    csrPem: '-----BEGIN CERTIFICATE REQUEST-----',
    keyUsage: ['DigitalSignature', 'KeyEncipherment'],
    extKeyUsage: ['ClientAuth'],
};

describe('VaultClient.signCertificateVerbatim', () => {

    it('should post to sign-verbatim with usage sent explicitly', async () => {
        const http = new RecordingHttp();

        await client(http).signCertificateVerbatim({...REQUEST, ttl: '8760h'});

        assert.equal(http.posts[0].url, '/v1/pki_dfsp/sign-verbatim/dfsp-client');
        // The role's client and server flags do not apply on this path, so usage is never left to it.
        assert.deepEqual(http.posts[0].body, {
            csr: REQUEST.csrPem,
            key_usage: ['DigitalSignature', 'KeyEncipherment'],
            ext_key_usage: ['ClientAuth'],
            ttl: '8760h',
            exclude_cn_from_sans: true,
        });
    });

    it('should never send a common name, so the subject stays the requester\'s', async () => {
        const http = new RecordingHttp();

        await client(http).signCertificateVerbatim(REQUEST);

        assert.ok(!('common_name' in http.posts[0].body));
        assert.ok(!('ttl' in http.posts[0].body), 'the role default applies when no TTL is given');
    });

    it('should return the leaf, its chain and its expiry', async () => {
        const signed = await client(new RecordingHttp()).signCertificateVerbatim(REQUEST);

        assert.ok(signed.certificatePem.includes('leaf'));
        assert.ok(signed.caChainPem?.includes('intermediate'));
        assert.equal(signed.serialNumber, '0a:1b');
        assert.equal(signed.expiration?.getTime(), 1_800_000_000_000);
    });

    it('should name the missing role when Vault has none', async () => {
        const http = new RecordingHttp();

        http.status = 404;

        await assert.rejects(
            client(http).signCertificateVerbatim(REQUEST),
            /no PKI role 'dfsp-client' on mount 'pki_dfsp'/);
    });
});
