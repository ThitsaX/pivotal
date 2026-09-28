import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { KeyProvider, VaultSettings } from '../../../../packages/shared/vault';

describe('KeyProvider', () => {

    it('should parse every valid provider', () => {
        assert.equal(KeyProvider.parse('vault-kv', KeyProvider.Database), KeyProvider.VaultKv);
        assert.equal(KeyProvider.parse('pkcs11', KeyProvider.Database), KeyProvider.Pkcs11);
        assert.equal(KeyProvider.parse('database', KeyProvider.VaultKv), KeyProvider.Database);
    });

    it('should tolerate whitespace and casing', () => {
        assert.equal(KeyProvider.parse('  VAULT-KV ', KeyProvider.Database), KeyProvider.VaultKv);
    });

    it('should use the fallback when unset', () => {
        assert.equal(KeyProvider.parse(undefined, KeyProvider.Database), KeyProvider.Database);
        assert.equal(KeyProvider.parse('', KeyProvider.VaultKv), KeyProvider.VaultKv);
    });

    it('should throw on an unrecognised value rather than defaulting', () => {
        // Silently defaulting would decide where private keys come from on the basis of a typo.
        assert.throws(() => KeyProvider.parse('vaultkv', KeyProvider.Database));
        assert.throws(() => KeyProvider.parse('none', KeyProvider.Database));
    });
});

describe('VaultSettings', () => {

    it('should report configured only when address and role are both present', () => {
        assert.equal(new VaultSettings('https://vault:8200', 'pivotal').isConfigured(), true);
        assert.equal(new VaultSettings('', 'pivotal').isConfigured(), false);
        assert.equal(new VaultSettings('https://vault:8200', '').isConfigured(), false);
        assert.equal(new VaultSettings('  ', '  ').isConfigured(), false);
    });

    it('should default the mount, prefix and token path', () => {
        const settings = new VaultSettings('https://vault:8200', 'pivotal');

        assert.equal(settings.kubernetesAuthPath, 'kubernetes');
        assert.equal(settings.kvMount, 'secret');
        assert.equal(settings.jwsKeyPathPrefix, 'pivotal/jwskey');
        assert.equal(settings.serviceAccountTokenPath, VaultSettings.DEFAULT_SERVICE_ACCOUNT_TOKEN_PATH);
    });
});
