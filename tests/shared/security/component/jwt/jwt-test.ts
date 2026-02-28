import * as assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { describe, it } from 'node:test';
import { Jwt } from '../../../../../packages/shared/security/component/jwt/jwt';
import { PrivateKey } from '../../../../../packages/shared/security/component/key/private-key';
import { PublicKey } from '../../../../../packages/shared/security/component/key/public-key';

function createRsaKeyPair(): { privateKey: PrivateKey; publicKey: PublicKey } {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        privateKeyEncoding: { format: 'pem', type: 'pkcs8' },
        publicKeyEncoding: { format: 'pem', type: 'spki' },
    });

    return {
        privateKey: PrivateKey.fromBuffer(Buffer.from(privateKey, 'utf-8')),
        publicKey: PublicKey.fromBuffer(Buffer.from(publicKey, 'utf-8')),
    };
}

describe('Jwt', () => {

    it('should encode and decode payload', () => {
        const payload = '{"amount":"100","currency":"USD"}';

        const encoded = Jwt.encode(payload);
        const decoded = Jwt.decode(encoded);

        assert.equal(decoded, payload);
    });

    it('should sign with default algorithm and verify token with public key', () => {
        const { privateKey, publicKey } = createRsaKeyPair();
        const payload = '{"amount":"100","currency":"USD"}';

        const token = Jwt.sign(privateKey, { kid: 'fsp-a' }, payload);
        const isVerified = Jwt.verify(publicKey, token);

        assert.equal(isVerified, true);
    });

    it('should verify jwt string against original json payload text', () => {
        const { privateKey } = createRsaKeyPair();
        const payload = '{"amount":"100","currency":"USD"}';

        const token = Jwt.sign(privateKey, { kid: 'fsp-a' }, payload);
        const isVerified = Jwt.verify(privateKey, token.full, payload);

        assert.equal(isVerified, true);
    });

    it('should sign with explicit algorithm and verify with public key token', () => {
        const { privateKey, publicKey } = createRsaKeyPair();
        const payload = '{"amount":"100","currency":"USD"}';

        const token = Jwt.sign(privateKey, 'RS512', { kid: 'fsp-a' }, payload);
        const isVerified = Jwt.verify(publicKey, token);

        const decodedHeader = JSON.parse(Jwt.decode(token.header)) as Record<string, string>;

        assert.equal(isVerified, true);
        assert.equal(decodedHeader.alg, 'RS512');
        assert.equal(decodedHeader.typ, 'JWT');
        assert.equal(decodedHeader.kid, 'fsp-a');
    });

    it('should return false when verifying string token without payload', () => {
        const { privateKey } = createRsaKeyPair();
        const token = Jwt.sign(privateKey, { kid: 'fsp-a' }, '{"amount":"100"}');

        const isVerified = (Jwt.verify as (key: PrivateKey, token: string, payload?: string) => boolean)(
            privateKey,
            token.full,
        );

        assert.equal(isVerified, false);
    });

    it('should return false for invalid token', () => {
        const { privateKey } = createRsaKeyPair();
        const invalidToken = 'invalid.token.value';

        const isVerified = Jwt.verify(privateKey, invalidToken, '{"amount":"100"}');

        assert.equal(isVerified, false);
    });

    it('should throw when signing non-json payload', () => {
        const { privateKey } = createRsaKeyPair();

        assert.throws(
            () => Jwt.sign(privateKey, { kid: 'fsp-a' }, 'sample-payload'),
            /JWT payload must be a valid JSON object\./,
        );
    });

    it('should throw when token parts are null', () => {
        assert.throws(
            () => new Jwt.Token(null as unknown as string, 'body', 'signature'),
            /cannot be null/i,
        );
    });
});
