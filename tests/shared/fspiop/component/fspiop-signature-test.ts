import * as assert from 'node:assert/strict';
import { createPrivateKey, createPublicKey } from 'node:crypto';
import { describe, it } from 'node:test';
import { FspiopSignature } from '../../../../packages/shared/fspiop/component/fspiop-signature';
import { Jwt } from '../../../../packages/shared/security/component/jwt/jwt';
import { RsaKeyPair } from '../../../../packages/shared/security/component/key/rsa-key-pair';

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

describe('FspiopSignature', () => {

    it('should sign payload and verify using matching RSA 2048 public key', () => {
        const keyPair = createRsaKeyPair();
        const headers = { kid: 'fsp-a' };
        const payload = JSON.stringify({ amount: '100', currency: 'USD' });

        assertRsa2048(keyPair);

        const signatureHeader = FspiopSignature.sign(keyPair.privateKey, headers, payload);
        const body = Jwt.encode(payload);
        const token = new Jwt.Token(signatureHeader.protectedHeader, body, signatureHeader.signature);
        const isVerified = FspiopSignature.verify(keyPair.publicKey, token);

        assert.ok(signatureHeader.signature.length > 0);
        assert.ok(signatureHeader.protectedHeader.length > 0);
        assert.equal(isVerified, true);
    });

    it('should fail verification with non-matching RSA 2048 public key', () => {
        const keyPairA = createRsaKeyPair();
        const keyPairB = createRsaKeyPair();
        const headers = { kid: 'fsp-a' };
        const payload = JSON.stringify({ amount: '100', currency: 'USD' });

        assertRsa2048(keyPairA);
        assertRsa2048(keyPairB);

        const signatureHeader = FspiopSignature.sign(keyPairA.privateKey, headers, payload);
        const body = Jwt.encode(payload);
        const token = new Jwt.Token(signatureHeader.protectedHeader, body, signatureHeader.signature);
        const isVerified = FspiopSignature.verify(keyPairB.publicKey, token);

        assert.equal(isVerified, false);
    });
});
