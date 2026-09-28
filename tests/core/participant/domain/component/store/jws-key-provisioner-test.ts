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

class FakeGenerator {

    readonly calls: {username: string; label: string}[] = [];

    generate(credential: {username: string; password: string}, label: string): Promise<string> {
        this.calls.push({username: credential.username, label});
        return Promise.resolve('-----BEGIN PUBLIC KEY-----\nfake\n-----END PUBLIC KEY-----\n');
    }
}

class FakeCredentials {

    readonly reads: string[] = [];

    credentialFor(vaultPath: string): Promise<{username: string; password: string}> {
        this.reads.push(vaultPath);
        const fspId = vaultPath.split('/').pop();
        return Promise.resolve({username: `cu-${fspId}`, password: 'secret'});
    }
}

function pkcs11Provisioner(generator = new FakeGenerator(), credentials = new FakeCredentials()) {
    const vault = new FakeVault();
    const provisioner = new Pkcs11JwsKeyProvisioner(
        generator as any, credentials, vault as any,
        'pivotal/hsmcred', 'pivotal/keyref', 'cu-web-outbound');

    return {provisioner, vault, generator, credentials};
}

describe('Pkcs11JwsKeyProvisioner', () => {

    it('should generate as the tenant, not as a service identity', async () => {
        // The device confers ownership at creation and cannot transfer it, so whoever generates a
        // key can always sign with it. Generating as anyone but the tenant hands that ability to
        // whoever generated it, for every tenant it ever onboarded.
        const {provisioner, credentials, generator} = pkcs11Provisioner();

        await provisioner.provision('DemoDFSP1');

        assert.deepEqual(credentials.reads, ['pivotal/hsmcred/DemoDFSP1']);
        assert.equal(generator.calls[0].username, 'cu-DemoDFSP1');
    });

    it('should write a key reference the reader can resolve', async () => {
        // The prefix and field have to agree with VaultJwsKeyRefSource, or provisioning succeeds
        // and signing then reports a tenant with no key.
        const {provisioner, vault} = pkcs11Provisioner();

        await provisioner.provision('DemoDFSP1');

        assert.equal(vault.writes[0].path, 'pivotal/keyref/DemoDFSP1');
        assert.equal(vault.writes[0].field, 'keyRef');
        assert.equal(vault.writes[0].value.startsWith('DemoDFSP1-jws-'), true);
    });

    it('should mint a new reference on every call, never reusing a label', async () => {
        // Rotation calls this again. A reused label would leave two keys answering to one
        // reference, and the device would sign with whichever it happened to find.
        const {provisioner, vault} = pkcs11Provisioner();

        await provisioner.provision('DemoDFSP1');
        await new Promise(resolve => setTimeout(resolve, 1100));
        await provisioner.provision('DemoDFSP1');

        assert.notEqual(vault.writes[0].value, vault.writes[1].value);
    });

    it('should return no private key, because none exists outside the device', async () => {
        const {provisioner} = pkcs11Provisioner();

        const provisioned = await provisioner.provision('DemoDFSP1');

        assert.equal(provisioned.legacyPrivateKeyPem, undefined);
        assert.match(provisioned.publicKeyPem, /BEGIN PUBLIC KEY/);
    });

    it('should fail rather than provision a tenant whose crypto user does not exist', async () => {
        // The crypto user is created by a custodian, because creating one needs a Crypto Officer
        // and no service holds that. This process can be given access to a tenant; it cannot
        // invent one.
        const credentials = {
            credentialFor: () => Promise.reject(new Error('No crypto-user password at Vault path')),
        };
        const {provisioner} = pkcs11Provisioner(new FakeGenerator(), credentials as any);

        await assert.rejects(provisioner.provision('DemoDFSP1'), /No crypto-user password/);
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
