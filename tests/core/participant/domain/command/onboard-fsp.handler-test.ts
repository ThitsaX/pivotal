import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {OnboardFspCommand, OnboardFspHandler} from '../../../../../packages/core/participant/domain/command';
import {JwsKeyProvisioner} from '../../../../../packages/core/participant/domain/component/store/jws-key-provisioner';
import {ParticipantKey} from '../../../../../packages/core/participant/domain/model';

const PUBLIC_KEY = '-----BEGIN PUBLIC KEY-----\nkey\n-----END PUBLIC KEY-----\n';

class FakeLedger {

    readonly onboarded: string[] = [];

    onboardFsp(name: string): Promise<void> {
        this.onboarded.push(name);
        return Promise.resolve();
    }
}

class FakeKeys {

    readonly saved: ParticipantKey[] = [];

    constructor(private readonly existing: ParticipantKey | null = null) {
    }

    findByFspId(): Promise<ParticipantKey | null> {
        return Promise.resolve(this.existing);
    }

    save(key: ParticipantKey): Promise<ParticipantKey> {
        this.saved.push(key);
        return Promise.resolve(key);
    }
}

const participants = {
    findByName: () => Promise.resolve(null),
    save: (participant: any) => Promise.resolve({...participant, id: 'id-1'}),
};

class FakeProvisioner extends JwsKeyProvisioner {

    provisioned = 0;

    constructor(private readonly ready: boolean, private readonly key: string | null) {
        super();
    }

    async assertReady(): Promise<void> {
        if (!this.ready) {
            throw Object.assign(new Error('not provisioned'), {code: 'PARTICIPANT_HSM_KEY_NOT_FOUND'});
        }
    }

    async provision(): Promise<JwsKeyProvisioner.Provisioned | null> {
        this.provisioned += 1;
        return this.key == null ? null : new JwsKeyProvisioner.Provisioned(this.key);
    }
}

function handler(ledger: FakeLedger, keys: FakeKeys, provisioner: JwsKeyProvisioner): OnboardFspHandler {
    return new OnboardFspHandler(ledger as any, participants as any, keys as any, provisioner);
}

const command = new OnboardFspCommand(new OnboardFspCommand.Input('DemoDFSP3', [], 'https://cb', PUBLIC_KEY));

describe('OnboardFspHandler', () => {

    it('records the provisioned public key, with signing off', async () => {
        const ledger = new FakeLedger();
        const keys = new FakeKeys();

        await handler(ledger, keys, new FakeProvisioner(true, PUBLIC_KEY)).execute(command);

        assert.deepEqual(ledger.onboarded, ['DemoDFSP3']);
        assert.equal(keys.saved[0].jwsPublicKey, PUBLIC_KEY);
        assert.equal(keys.saved[0].jwsSignEnabled, false);
    });

    it('refuses before the ledger when the key is not ready', async () => {
        // A DFSP registered at the Hub with no key to sign with is worse than one not onboarded.
        const ledger = new FakeLedger();
        const keys = new FakeKeys();

        await assert.rejects(
            handler(ledger, keys, new FakeProvisioner(false, PUBLIC_KEY)).execute(command),
            {code: 'PARTICIPANT_HSM_KEY_NOT_FOUND'});

        assert.deepEqual(ledger.onboarded, []);
        assert.equal(keys.saved.length, 0);
    });

    it('onboards without a key where the deployment holds none', async () => {
        const ledger = new FakeLedger();
        const keys = new FakeKeys();

        await handler(ledger, keys, new FakeProvisioner(true, null)).execute(command);

        assert.deepEqual(ledger.onboarded, ['DemoDFSP3']);
        assert.equal(keys.saved.length, 0, 'no key row for a tenant with no key');
    });

    it('does not check readiness again for a tenant that already holds a key', async () => {
        // Re-onboarding to correct an endpoint must not depend on the key record still being in Vault.
        const existing = new ParticipantKey();
        existing.fspId = 'DemoDFSP3';
        existing.jwsPublicKey = PUBLIC_KEY;
        const provisioner = new FakeProvisioner(false, PUBLIC_KEY);
        const ledger = new FakeLedger();

        await handler(ledger, new FakeKeys(existing), provisioner).execute(command);

        assert.deepEqual(ledger.onboarded, ['DemoDFSP3']);
        assert.equal(provisioner.provisioned, 0);
    });
});
