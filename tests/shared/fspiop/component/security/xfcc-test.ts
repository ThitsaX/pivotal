import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {Xfcc} from '../../../../../packages/shared/fspiop/component/security/xfcc';

const HASH = 'fe805c4c7baff3bc945a1757284fbba3ac592746185d47c74bd517e2f771aefd';
const OTHER = 'aa'.repeat(32);

describe('Xfcc', () => {

    it('should read the fingerprint Envoy forwards', () => {
        const parsed = Xfcc.parse(
            `By=spiffe://cluster.local/ns/istio-ingress-ext/sa/gateway;Hash=${HASH}`);

        assert.equal(parsed?.hash, HASH);
        assert.equal(parsed?.by, 'spiffe://cluster.local/ns/istio-ingress-ext/sa/gateway');
    });

    it('should accept the keys in any case and any order', () => {
        // Envoy's casing is not contractual, and neither is the order of the pairs.
        assert.equal(Xfcc.parse(`SUBJECT="CN=wallet1";hash=${HASH}`)?.hash, HASH);
        assert.equal(Xfcc.parse(`HASH=${HASH.toUpperCase()}`)?.hash, HASH);
    });

    it('should read a quoted subject containing separators', () => {
        const parsed = Xfcc.parse(`Hash=${HASH};Subject="O=ThitsaWorks,OU=DFSP,CN=wallet1"`);

        assert.equal(parsed?.subject, 'O=ThitsaWorks,OU=DFSP,CN=wallet1');
        assert.equal(parsed?.hash, HASH, 'a comma inside quotes must not end the entry');
    });

    it('should take the first entry only when a proxy appended rather than replaced', () => {
        // Under APPEND_FORWARD the caller's own entry can be present. The first entry is the one
        // the nearest trusted proxy wrote, and later entries must not be honoured.
        const parsed = Xfcc.parse(`Hash=${HASH},Hash=${OTHER}`);

        assert.equal(parsed?.hash, HASH);
    });

    it('should not let a quoted comma smuggle a second entry into the first', () => {
        const parsed = Xfcc.parse(`Subject="a,Hash=${OTHER}";Hash=${HASH}`);

        assert.equal(parsed?.hash, HASH);
    });

    it('should ignore a repeated key within one entry', () => {
        assert.equal(Xfcc.parse(`Hash=${HASH};Hash=${OTHER}`)?.hash, HASH);
    });

    it('should return nothing when there is no usable identity', () => {
        assert.equal(Xfcc.parse(undefined), null);
        assert.equal(Xfcc.parse(''), null);
        assert.equal(Xfcc.parse('By=spiffe://cluster.local/ns/x/sa/y'), null, 'no hash');
        assert.equal(Xfcc.parse('Hash='), null);
        assert.equal(Xfcc.parse('garbage'), null);
    });

    it('should reject anything that is not a SHA-256 digest', () => {
        // A short or non-hex value cannot be a certificate fingerprint, and letting it through
        // would turn a malformed header into a database lookup.
        assert.equal(Xfcc.parse('Hash=deadbeef'), null);
        assert.equal(Xfcc.parse(`Hash=${'z'.repeat(64)}`), null);
        assert.equal(Xfcc.parse(`Hash=${HASH}00`), null);
    });
});
