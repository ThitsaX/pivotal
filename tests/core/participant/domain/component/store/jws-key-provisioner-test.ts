import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {generateKeyPairSync} from 'node:crypto';
import {
    DatabaseJwsKeyProvisioner,
    NoJwsKeyProvisioner,
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

const PUBLIC_KEY = generateKeyPairSync('rsa', {modulusLength: 2048})
    .publicKey.export({type: 'spki', format: 'pem'}).toString();

/** What the custodian's provisioning script leaves in Vault, keyed by path. */
class FakeKeyRecords {

    readonly reads: string[] = [];

    constructor(private readonly records: Record<string, Record<string, string>>) {
    }

    readKvField(path: string, field: string): Promise<string | undefined> {
        this.reads.push(path);
        return Promise.resolve(this.records[path]?.[field]);
    }
}

function pkcs11Provisioner(records: Record<string, Record<string, string>>) {
    const vault = new FakeKeyRecords(records);

    return {provisioner: new Pkcs11JwsKeyProvisioner(vault, 'pivotal/keyref'), vault};
}

describe('Pkcs11JwsKeyProvisioner', () => {

    it('should record the public key a custodian provisioned', async () => {
        const {provisioner, vault} = pkcs11Provisioner({
            'pivotal/keyref/DemoDFSP1': {keyRef: 'DemoDFSP1-jws-20261014T1200', publicKey: PUBLIC_KEY},
        });

        const provisioned = await provisioner.provision('DemoDFSP1');

        // The path has to agree with VaultJwsKeyRefSource and with what the script writes.
        assert.ok(vault.reads.every(path => path === 'pivotal/keyref/DemoDFSP1'));
        assert.equal(provisioned.publicKeyPem, PUBLIC_KEY);
        assert.equal(provisioned.legacyPrivateKeyPem, undefined);
    });

    it('should refuse a DFSP whose key has not been provisioned yet', async () => {
        const {provisioner} = pkcs11Provisioner({});

        await assert.rejects(provisioner.assertReady('DemoDFSP1'), {code: 'PARTICIPANT_HSM_KEY_NOT_FOUND'});
        await assert.rejects(provisioner.provision('DemoDFSP1'), {code: 'PARTICIPANT_HSM_KEY_NOT_FOUND'});
    });

    it('should refuse a record holding a key reference but no public key', async () => {
        // Left by a provisioning run that stopped part-way. Recording nothing is better than
        // recording a key MCM could never match.
        const {provisioner} = pkcs11Provisioner({
            'pivotal/keyref/DemoDFSP1': {keyRef: 'DemoDFSP1-jws-20261014T1200'},
        });

        await assert.rejects(provisioner.assertReady('DemoDFSP1'), {code: 'PARTICIPANT_HSM_KEY_NOT_FOUND'});
    });

    it('should refuse a public key that is not one', async () => {
        const {provisioner} = pkcs11Provisioner({
            'pivotal/keyref/DemoDFSP1': {keyRef: 'DemoDFSP1-jws-20261014T1200', publicKey: 'not a key'},
        });

        await assert.rejects(provisioner.assertReady('DemoDFSP1'), {code: 'PARTICIPANT_HSM_KEY_RECORD_INVALID'});
    });
});

describe('NoJwsKeyProvisioner', () => {

    it('should create no key and refuse nothing', async () => {
        // What an unset KEY_PROVIDER selects: a deployment that has not turned on JWS onboards
        // DFSPs without keeping keys it would never use.
        const provisioner = new NoJwsKeyProvisioner();

        await provisioner.assertReady('DemoDFSP1');
        assert.equal(await provisioner.provision('DemoDFSP1'), null);
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
