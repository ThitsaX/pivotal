import * as assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { FspInboundGuard } from '../../packages/shared/fspiop/component/nest/guard/fsp-inbound.guard';
import { FspiopSettings } from '../../packages/shared/fspiop/component/fspiop-settings';
import { FspiopSignature } from '../../packages/shared/fspiop/component/fspiop-signature';
import { FspiopSigningInterceptor } from '../../packages/shared/fspiop/component/axios/interceptor/fspiop-signing.interceptor';
import { FspiopVerifyMode } from '../../packages/shared/fspiop/component/fspiop-verify-mode';
import { StaticJwsPolicyStore } from '../../packages/shared/fspiop/component/security/jws-policy-store';
import { PrivateKey, PrivateKeyStore, PublicKey, PublicKeyStore } from '../../packages/shared/security/component/key';
import { VaultAuthMethod, VaultClient, VaultSettings } from '../../packages/shared/vault';
import { VaultJwsPrivateKeySource } from '../../packages/core/participant/domain/component/store/jws-private-key-source';
import { ParticipantKey, ParticipantKeyRole } from '../../packages/core/participant/domain/model/participant-key.model';

/**
 * The one test that exercises the seams unit tests cannot reach.
 *
 * Everything else in this repo mocks Vault. This runs against a real Vault over the real KV v2 wire
 * protocol, and carries a key all the way from `vault kv put` to a signature that the inbound guard
 * accepts. The agreements it covers — the KV v2 response envelope, the `privateKey` field name, the
 * `<prefix>/<fspId>` path convention, PEM round-tripping — are shared with the Java connector and
 * are otherwise held together only by both sides having been written by the same author.
 *
 * Requires a Vault reachable at VAULT_IT_ADDRESS (default http://127.0.0.1:8210) with
 * VAULT_IT_TOKEN. Skips when there is none, so it never breaks a machine that has not started one.
 *
 *   docker run -d --name pivotal-vault-it -p 8210:8200 \
 *     -e VAULT_DEV_ROOT_TOKEN_ID=root-it hashicorp/vault:1.17
 */

const ADDRESS = process.env['VAULT_IT_ADDRESS'] ?? 'http://127.0.0.1:8210';
const TOKEN = process.env['VAULT_IT_TOKEN'] ?? 'root-it';
const FSP_ID = 'payerfsp';
const URI = '/quotes/q-integration';
const BODY = { quoteId: 'q-integration', transactionId: 't-integration' };

function settings(): VaultSettings {
    return new VaultSettings(
        ADDRESS, '', 'kubernetes', 'secret', 'pivotal/jwskey',
        VaultSettings.DEFAULT_SERVICE_ACCOUNT_TOKEN_PATH, 5_000,
        VaultAuthMethod.Token, TOKEN,
    );
}

function signingTenant(): ParticipantKey {
    const key = new ParticipantKey();

    key.fspId = FSP_ID;
    key.role = ParticipantKeyRole.Self;
    key.jwsPrivateKey = null;        // deliberately absent: the key must come from Vault
    key.jwsSignEnabled = true;
    key.jwsVerifyMode = FspiopVerifyMode.Require;

    return key;
}

class SingleKeyPublicStore extends PublicKeyStore {
    constructor(private readonly publicKey: PublicKey) {
        super();
    }

    load(): PublicKeyStore {
        return this;
    }

    get(fspId: string): PublicKey | undefined {
        return fspId === FSP_ID ? this.publicKey : undefined;
    }
}

class SingleKeyPrivateStore extends PrivateKeyStore {
    constructor(private readonly privateKey: PrivateKey) {
        super();
    }

    load(): PrivateKeyStore {
        return this;
    }

    get(fspId: string): PrivateKey | undefined {
        return fspId === FSP_ID ? this.privateKey : undefined;
    }
}

async function vaultReachable(): Promise<boolean> {
    try {
        const response = await fetch(`${ADDRESS}/v1/sys/health`);
        return response.ok;
    } catch {
        return false;
    }
}

describe('JWS over a real Vault (integration)', () => {

    let available = false;
    let resolved: Map<string, string>;

    before(async () => {
        available = await vaultReachable();

        if (!available) {
            return;
        }

        const vaultSettings = settings();
        const source = new VaultJwsPrivateKeySource(new VaultClient(vaultSettings), vaultSettings);

        resolved = await source.resolve([signingTenant()], new Map());
    });

    it('should load a signing key from Vault over the real KV v2 protocol', (t) => {
        if (!available) {
            t.skip('no Vault at ' + ADDRESS);
            return;
        }

        const pem = resolved.get(FSP_ID);

        assert.ok(pem, 'expected a key at secret/pivotal/jwskey/' + FSP_ID);
        assert.match(pem, /^-----BEGIN PRIVATE KEY-----/);
    });

    it('should sign with the Vault-sourced key and verify through the inbound guard', async (t) => {
        if (!available) {
            t.skip('no Vault at ' + ADDRESS);
            return;
        }

        // The key travels Vault -> PrivateKeyStore -> interceptor, exactly as in web-outbound.
        const privateKey = PrivateKey.fromBuffer(Buffer.from(resolved.get(FSP_ID)!, 'utf-8'));
        const publicKey = PublicKey.fromBuffer(
            Buffer.from(
                require('node:crypto')
                    .createPublicKey(privateKey.toBuffer())
                    .export({type: 'spki', format: 'pem'}) as string,
                'utf-8',
            ),
        );

        const interceptor = new FspiopSigningInterceptor(new SingleKeyPrivateStore(privateKey)).build();

        const config = await interceptor({
            method: 'put',
            baseURL: 'http://moja-quoting-service.mojaloop',
            url: URI,
            data: BODY,
            headers: {
                'fspiop-source': FSP_ID,
                'fspiop-destination': 'payeefsp',
                'date': 'Sun, 24 Aug 2026 10:00:00 GMT',
            },
        } as never) as {headers: Record<string, string>};

        assert.equal(config.headers['fspiop-uri'], URI);
        assert.equal(config.headers['fspiop-http-method'], 'PUT');
        assert.ok(config.headers['fspiop-signature']);

        // Now the receiving side, with the guard in its strictest mode.
        const guard = new FspInboundGuard(
            new SingleKeyPublicStore(publicKey),
            new FspiopSettings('hub', '', '', '', true, false),
            new StaticJwsPolicyStore(true, FspiopVerifyMode.Require),
        );

        const request = {
            method: 'PUT',
            body: BODY,
            headers: {
                'fspiop-source': FSP_ID,
                'fspiop-destination': 'payeefsp',
                'fspiop-uri': config.headers['fspiop-uri'],
                'fspiop-http-method': config.headers['fspiop-http-method'],
                'fspiop-signature': config.headers['fspiop-signature'],
            },
        };

        const context = {switchToHttp: () => ({getRequest: () => request})};

        assert.equal(guard.canActivate(context as never), true);
    });

    it('should reject the same signature against a different resource', async (t) => {
        if (!available) {
            t.skip('no Vault at ' + ADDRESS);
            return;
        }

        const privateKey = PrivateKey.fromBuffer(Buffer.from(resolved.get(FSP_ID)!, 'utf-8'));
        const publicKey = PublicKey.fromBuffer(
            Buffer.from(
                require('node:crypto')
                    .createPublicKey(privateKey.toBuffer())
                    .export({type: 'spki', format: 'pem'}) as string,
                'utf-8',
            ),
        );

        const header = FspiopSignature.sign(
            privateKey,
            {method: 'PUT', uri: URI, source: FSP_ID, destination: 'payeefsp'},
            JSON.stringify(BODY),
        );

        const guard = new FspInboundGuard(
            new SingleKeyPublicStore(publicKey),
            new FspiopSettings('hub', '', '', '', true, false),
            new StaticJwsPolicyStore(true, FspiopVerifyMode.Require),
        );

        // Replaying a valid signature against another endpoint must fail the cross-check.
        const request = {
            method: 'PUT',
            body: BODY,
            headers: {
                'fspiop-source': FSP_ID,
                'fspiop-destination': 'payeefsp',
                'fspiop-uri': '/quotes/some-other-quote',
                'fspiop-http-method': 'PUT',
                'fspiop-signature': JSON.stringify(header),
            },
        };

        assert.throws(() => guard.canActivate({switchToHttp: () => ({getRequest: () => request})} as never));
    });
});
