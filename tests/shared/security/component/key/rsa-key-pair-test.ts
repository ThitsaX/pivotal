import * as assert from 'node:assert/strict';
import { createPrivateKey, createPublicKey } from 'node:crypto';
import { describe, it } from 'node:test';
import { Jwt } from '../../../../../packages/shared/security/component/jwt/jwt';
import { RsaKeyPair } from '../../../../../packages/shared/security/component/key/rsa-key-pair';

describe('RsaKeyPair', () => {

    it('should generate RSA 2048 private and public keys', () => {
        const keyPair = RsaKeyPair.generate();
        const privateKeyObject = createPrivateKey(keyPair.privateKey.toBuffer());
        const publicKeyObject = createPublicKey(keyPair.publicKey.toBuffer());

        assert.equal(privateKeyObject.asymmetricKeyType, 'rsa');
        assert.equal(publicKeyObject.asymmetricKeyType, 'rsa');
        assert.equal(privateKeyObject.asymmetricKeyDetails?.modulusLength, 2048);
        assert.equal(publicKeyObject.asymmetricKeyDetails?.modulusLength, 2048);
    });

    it('should generate a key pair that can sign and verify jwt', () => {
        const keyPair = RsaKeyPair.generate();
        const payload = '{"amount":"100","currency":"USD"}';

        const token = Jwt.sign(keyPair.privateKey, { kid: 'fsp-a' }, payload);
        const isVerified = Jwt.verify(keyPair.publicKey, token);

        assert.equal(isVerified, true);
    });
});
