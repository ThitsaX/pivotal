import * as assert from 'node:assert/strict';
import { createPrivateKey, createPublicKey } from 'node:crypto';
import { describe, it } from 'node:test';
import { FspiopSignature } from '../../../../packages/shared/fspiop/component/fspiop-signature';
import { RsaKeyPair } from '../../../../packages/shared/security/component/key/rsa-key-pair';
import { loadVectors } from './fspiop-jws-vectors';

function createRsaKeyPair(): RsaKeyPair.KeyPair {
    return RsaKeyPair.generate();
}

function assertRsa2048(keyPair: RsaKeyPair.KeyPair): void {
    const privateKeyObject = createPrivateKey(keyPair.privateKey.toBuffer());
    const publicKeyObject = createPublicKey(keyPair.publicKey.toBuffer());

    assert.equal(privateKeyObject.asymmetricKeyType, 'rsa');
    assert.equal(publicKeyObject.asymmetricKeyType, 'rsa');
    assert.equal(privateKeyObject.asymmetricKeyDetails?.modulusLength, 2048);
    assert.equal(publicKeyObject.asymmetricKeyDetails?.modulusLength, 2048);
}

const INPUT = {
    method: 'PUT',
    uri: 'https://hub.example.com/quotes/abc-123',
    source: 'payeefsp',
    destination: 'payerfsp',
    date: 'Tue, 23 Aug 2026 09:15:00 GMT',
};

const PAYLOAD = JSON.stringify({ amount: '100', currency: 'USD' });

describe('FspiopSignature', () => {

    it('should sign and verify with a matching RSA 2048 key pair', () => {
        const keyPair = createRsaKeyPair();
        assertRsa2048(keyPair);

        const header = FspiopSignature.sign(keyPair.privateKey, INPUT, PAYLOAD);

        assert.ok(header.signature.length > 0);
        assert.ok(header.protectedHeader.length > 0);
        assert.equal(FspiopSignature.verify(keyPair.publicKey, header, PAYLOAD), true);
    });

    it('should fail verification with a non-matching public key', () => {
        const signer = createRsaKeyPair();
        const other = createRsaKeyPair();

        const header = FspiopSignature.sign(signer.privateKey, INPUT, PAYLOAD);

        assert.equal(FspiopSignature.verify(other.publicKey, header, PAYLOAD), false);
    });

    it('should fail verification when the body is altered', () => {
        const keyPair = createRsaKeyPair();
        const header = FspiopSignature.sign(keyPair.privateKey, INPUT, PAYLOAD);

        const tampered = JSON.stringify({ amount: '9999', currency: 'USD' });

        assert.equal(FspiopSignature.verify(keyPair.publicKey, header, tampered), false);
    });

    it('should fail verification when the protected header is altered', () => {
        const keyPair = createRsaKeyPair();
        const header = FspiopSignature.sign(keyPair.privateKey, INPUT, PAYLOAD);

        const fields = FspiopSignature.decodeProtectedHeader(header.protectedHeader);
        fields['FSPIOP-Destination'] = 'attackerfsp';

        const tampered = {
            signature: header.signature,
            protectedHeader: Buffer.from(JSON.stringify(fields), 'utf-8').toString('base64url'),
        };

        assert.equal(FspiopSignature.verify(keyPair.publicKey, tampered, PAYLOAD), false);
    });

    it('should verify a body that differs only by key order or whitespace', () => {
        const keyPair = createRsaKeyPair();
        const header = FspiopSignature.sign(keyPair.privateKey, INPUT, PAYLOAD);

        // Re-serialization on the wire must not break verification.
        const reordered = '{ "amount": "100",  "currency": "USD" }';

        assert.equal(FspiopSignature.verify(keyPair.publicKey, header, reordered), true);
    });

    it('should return false rather than throw on a malformed protected header', () => {
        const keyPair = createRsaKeyPair();

        const malformed = { signature: 'nope', protectedHeader: 'not-base64-json' };

        assert.equal(FspiopSignature.verify(keyPair.publicKey, malformed, PAYLOAD), false);
    });

    it('should reject a payload that is not a JSON object', () => {
        const keyPair = createRsaKeyPair();

        assert.throws(() => FspiopSignature.sign(keyPair.privateKey, INPUT, '"just-a-string"'));
        assert.throws(() => FspiopSignature.sign(keyPair.privateKey, INPUT, 'not json at all'));
    });

    it('should reject an unsupported algorithm', () => {
        const keyPair = createRsaKeyPair();

        assert.throws(() => FspiopSignature.sign(
            keyPair.privateKey, { ...INPUT, alg: 'none' }, PAYLOAD,
        ));
    });

    describe('conformance vectors', () => {

        const vectors = loadVectors();

        for (const vector of vectors.vectors) {

            it(`should produce the expected signing input — ${vector.name}`, () => {
                const keyPair = createRsaKeyPair();

                const header = FspiopSignature.sign(
                    keyPair.privateKey,
                    {
                        method: vector.request.method,
                        uri: vector.request.url,
                        source: vector.request.headers['fspiop-source'],
                        destination: vector.request.headers['fspiop-destination'],
                        date: vector.request.headers['date'],
                    },
                    JSON.stringify(vector.request.body),
                );

                assert.equal(header.protectedHeader, vector.expected.protectedHeaderB64);

                const payloadB64 = Buffer
                    .from(JSON.stringify(vector.request.body), 'utf-8')
                    .toString('base64url');

                assert.equal(payloadB64, vector.expected.payloadB64);
                assert.equal(
                    `${header.protectedHeader}.${payloadB64}`,
                    vector.expected.signingInput,
                );

                assert.equal(
                    FspiopSignature.verify(
                        keyPair.publicKey, header, JSON.stringify(vector.request.body),
                    ),
                    true,
                );
            });
        }
    });
});
