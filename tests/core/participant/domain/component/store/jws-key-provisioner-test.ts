import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
    DatabaseJwsKeyProvisioner,
    Pkcs11JwsKeyProvisioner,
    VaultJwsKeyProvisioner,
} from '../../../../../../packages/core/participant/domain/component/store/jws-key-provisioner';
import {VaultSettings} from '../../../../../../packages/shared/vault';

const SETTINGS = new VaultSettings('http://vault:8200', 'web-pivotal', 'kubernetes', 'secret',
    'pivotal/jwskey');

class FakeVault {

    readonly writes: {path: string; field: string; value: string}[] = [];

    writeKvField(path: string, field: string, value: string): Promise<void> {
        this.writes.push({path, field, value});
        return Promise.resolve();
    }
}

describe('VaultJwsKeyProvisioner', () => {

    it('should write the private key to the path the reader looks in', async () => {
        const vault = new FakeVault();

        await new VaultJwsKeyProvisioner(vault as any, SETTINGS).provision('DemoDFSP1');

        // The prefix and field have to agree with VaultJwsPrivateKeySource, or provisioning
        // succeeds and signing then reports a tenant with no key.
        assert.equal(vault.writes[0].path, 'pivotal/jwskey/DemoDFSP1');
        assert.equal(vault.writes[0].field, 'privateKey');
        assert.match(vault.writes[0].value, /BEGIN PRIVATE KEY/);
    });

    it('should return the public key and never the private one', async () => {
        // The property the whole seam exists for: a caller cannot accidentally persist or log
        // private key material, because under this profile it is not in the answer at all.
        const provisioned = await new VaultJwsKeyProvisioner(new FakeVault() as any, SETTINGS)
            .provision('DemoDFSP1');

        assert.match(provisioned.publicKeyPem, /BEGIN PUBLIC KEY/);
        assert.equal(provisioned.legacyPrivateKeyPem, undefined);
    });

    it('should give each tenant its own key', async () => {
        const vault = new FakeVault();
        const provisioner = new VaultJwsKeyProvisioner(vault as any, SETTINGS);

        const first = await provisioner.provision('DemoDFSP1');
        const second = await provisioner.provision('DemoDFSP2');

        assert.notEqual(first.publicKeyPem, second.publicKeyPem);
        assert.notEqual(vault.writes[0].value, vault.writes[1].value);
        assert.deepEqual(
            vault.writes.map(w => w.path),
            ['pivotal/jwskey/DemoDFSP1', 'pivotal/jwskey/DemoDFSP2']);
    });
});

describe('Pkcs11JwsKeyProvisioner', () => {

    it('should refuse rather than fall back to a software key', async () => {
        // A silent downgrade would put a private key on a host in a deployment that chose hardware
        // custody to prevent exactly that, and nothing downstream would show the difference.
        await assert.rejects(
            new Pkcs11JwsKeyProvisioner().provision('DemoDFSP1'),
            /not implemented/);
    });
});

describe('DatabaseJwsKeyProvisioner', () => {

    it('should hand back the private key, because the database is the custody', async () => {
        const provisioned = await new DatabaseJwsKeyProvisioner().provision('DemoDFSP1');

        assert.match(provisioned.publicKeyPem, /BEGIN PUBLIC KEY/);
        assert.match(provisioned.legacyPrivateKeyPem ?? '', /BEGIN PRIVATE KEY/);
    });

    it('should be the only profile that does', async () => {
        // Stated as a test so that adding a profile which returns a private key is a deliberate
        // act rather than a copy-paste.
        const vault = await new VaultJwsKeyProvisioner(new FakeVault() as any, SETTINGS)
            .provision('DemoDFSP1');

        assert.equal(vault.legacyPrivateKeyPem, undefined);
    });
});
