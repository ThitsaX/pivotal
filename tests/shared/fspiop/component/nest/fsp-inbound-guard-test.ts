import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FspInboundGuard } from '../../../../../packages/shared/fspiop/component/nest/guard/fsp-inbound.guard';
import { FspiopSettings } from '../../../../../packages/shared/fspiop/component/fspiop-settings';
import { FspiopSignature } from '../../../../../packages/shared/fspiop/component/fspiop-signature';
import { FspiopVerifyMode } from '../../../../../packages/shared/fspiop/component/fspiop-verify-mode';
import {
    JwsPolicyStore,
    StaticJwsPolicyStore,
} from '../../../../../packages/shared/fspiop/component/security/jws-policy-store';
import { PublicKey, PublicKeyStore } from '../../../../../packages/shared/security/component/key';
import { RsaKeyPair } from '../../../../../packages/shared/security/component/key/rsa-key-pair';

const SOURCE = 'payerfsp';
const DESTINATION = 'payeefsp';
const URI = '/quotes/q-1';
const BODY = { quoteId: 'q-1', transactionId: 't-1' };

class FakePublicKeyStore extends PublicKeyStore {
    constructor(private readonly keys: Record<string, PublicKey>) {
        super();
    }

    load(): PublicKeyStore {
        return this;
    }

    get(fspId: string): PublicKey | undefined {
        return this.keys[fspId];
    }
}

function settings(useJws = true): FspiopSettings {
    return new FspiopSettings('hub', '', '', '', useJws, false);
}

function contextFor(headers: Record<string, string>, body: unknown = BODY, method = 'PUT'): any {
    const request = { headers, body, method };
    return { switchToHttp: () => ({ getRequest: () => request }) };
}

function signedHeaders(keyPair: RsaKeyPair.KeyPair, overrides: Record<string, string> = {}) {
    const signature = FspiopSignature.sign(
        keyPair.privateKey,
        { method: 'PUT', uri: URI, source: SOURCE, destination: DESTINATION },
        JSON.stringify(BODY),
    );

    return {
        'fspiop-source': SOURCE,
        'fspiop-destination': DESTINATION,
        'fspiop-uri': URI,
        'fspiop-http-method': 'PUT',
        'fspiop-signature': JSON.stringify(signature),
        ...overrides,
    };
}

function guardWith(policy: JwsPolicyStore, keys: Record<string, PublicKey> = {}): FspInboundGuard {
    return new FspInboundGuard(new FakePublicKeyStore(keys), settings(), policy);
}

describe('FspInboundGuard', () => {

    describe('mode: off', () => {

        it('should accept an unsigned request', () => {
            const guard = guardWith(new StaticJwsPolicyStore(false, FspiopVerifyMode.Off));

            assert.equal(guard.canActivate(contextFor({ 'fspiop-source': SOURCE })), true);
        });

        it('should accept a request whose signature is invalid, without checking it', () => {
            const guard = guardWith(new StaticJwsPolicyStore(false, FspiopVerifyMode.Off));

            const headers = {
                'fspiop-source': SOURCE,
                'fspiop-signature': JSON.stringify({ signature: 'bad', protectedHeader: 'bad' }),
            };

            assert.equal(guard.canActivate(contextFor(headers)), true);
        });
    });

    describe('mode: verify-if-present', () => {

        it('should accept an unsigned request and count it', () => {
            const guard = guardWith(new StaticJwsPolicyStore(false, FspiopVerifyMode.VerifyIfPresent));

            assert.equal(guard.canActivate(contextFor({ 'fspiop-source': SOURCE })), true);
            assert.equal(guard.canActivate(contextFor({ 'fspiop-source': SOURCE })), true);

            assert.equal(guard.unsignedAcceptedCounts().get(SOURCE), 2);
        });

        it('should verify a signature when one is present', () => {
            const keyPair = RsaKeyPair.generate();
            const guard = guardWith(
                new StaticJwsPolicyStore(false, FspiopVerifyMode.VerifyIfPresent),
                { [SOURCE]: keyPair.publicKey },
            );

            assert.equal(guard.canActivate(contextFor(signedHeaders(keyPair))), true);
            assert.equal(guard.unsignedAcceptedCounts().size, 0);
        });

        it('should reject a present-but-invalid signature rather than waving it through', () => {
            const keyPair = RsaKeyPair.generate();
            const other = RsaKeyPair.generate();

            const guard = guardWith(
                new StaticJwsPolicyStore(false, FspiopVerifyMode.VerifyIfPresent),
                { [SOURCE]: other.publicKey },
            );

            assert.throws(() => guard.canActivate(contextFor(signedHeaders(keyPair))));
        });

        it('should reject a signature from a source with no registered key', () => {
            const keyPair = RsaKeyPair.generate();
            const guard = guardWith(new StaticJwsPolicyStore(false, FspiopVerifyMode.VerifyIfPresent));

            assert.throws(() => guard.canActivate(contextFor(signedHeaders(keyPair))));
        });
    });

    describe('mode: require', () => {

        it('should reject an unsigned request', () => {
            const guard = guardWith(new StaticJwsPolicyStore(false, FspiopVerifyMode.Require));

            assert.throws(() => guard.canActivate(contextFor({ 'fspiop-source': SOURCE })));
        });

        it('should accept a correctly signed request', () => {
            const keyPair = RsaKeyPair.generate();
            const guard = guardWith(
                new StaticJwsPolicyStore(false, FspiopVerifyMode.Require),
                { [SOURCE]: keyPair.publicKey },
            );

            assert.equal(guard.canActivate(contextFor(signedHeaders(keyPair))), true);
        });
    });

    describe('protected-header cross-checks', () => {

        const keyPair = RsaKeyPair.generate();

        function requireGuard(): FspInboundGuard {
            return guardWith(
                new StaticJwsPolicyStore(false, FspiopVerifyMode.Require),
                { [SOURCE]: keyPair.publicKey },
            );
        }

        it('should reject when the fspiop-uri header disagrees with the signed URI', () => {
            const headers = signedHeaders(keyPair, { 'fspiop-uri': '/quotes/other' });

            assert.throws(() => requireGuard().canActivate(contextFor(headers)));
        });

        it('should reject when the request method disagrees with the signed method', () => {
            assert.throws(
                () => requireGuard().canActivate(contextFor(signedHeaders(keyPair), BODY, 'POST')),
            );
        });

        it('should reject when the fspiop-destination header disagrees with the signed value', () => {
            const headers = signedHeaders(keyPair, { 'fspiop-destination': 'attackerfsp' });

            assert.throws(() => requireGuard().canActivate(contextFor(headers)));
        });

        it('should reject when the fspiop-uri header is absent', () => {
            const headers = signedHeaders(keyPair);
            delete (headers as Record<string, string>)['fspiop-uri'];

            assert.throws(() => requireGuard().canActivate(contextFor(headers)));
        });
    });

    describe('bodyless requests', () => {

        it('should reject a signature on a request with no body', () => {
            const keyPair = RsaKeyPair.generate();
            const guard = guardWith(
                new StaticJwsPolicyStore(false, FspiopVerifyMode.Require),
                { [SOURCE]: keyPair.publicKey },
            );

            assert.throws(() => guard.canActivate(contextFor(signedHeaders(keyPair), {})));
        });

        it('should accept an unsigned bodyless request under verify-if-present', () => {
            const guard = guardWith(new StaticJwsPolicyStore(false, FspiopVerifyMode.VerifyIfPresent));

            assert.equal(guard.canActivate(contextFor({ 'fspiop-source': SOURCE }, {})), true);
        });
    });

    describe('global kill switch', () => {

        it('should bypass everything when useJws is false', () => {
            const guard = new FspInboundGuard(
                new FakePublicKeyStore({}),
                settings(false),
                new StaticJwsPolicyStore(false, FspiopVerifyMode.Require),
            );

            assert.equal(guard.canActivate(contextFor({ 'fspiop-source': SOURCE })), true);
        });
    });

    it('should reject a request with no fspiop-source', () => {
        const guard = guardWith(new StaticJwsPolicyStore(false, FspiopVerifyMode.Require));

        assert.throws(() => guard.canActivate(contextFor({})));
    });
});
