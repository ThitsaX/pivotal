import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
    JwsKeyPublishScheduler,
} from '../../../../../packages/core/trust/domain/component/jws-key-publish.scheduler';
import {
    ParticipantKeyRole,
} from '../../../../../packages/core/participant/domain/model/participant-key.model';

const PUBLIC_KEY = '-----BEGIN PUBLIC KEY-----\nours\n-----END PUBLIC KEY-----';
const OTHER_KEY = '-----BEGIN PUBLIC KEY-----\ntheirs\n-----END PUBLIC KEY-----';

function tenant(overrides: Record<string, unknown> = {}): any {
    return {
        fspId: 'DemoDFSP1',
        role: ParticipantKeyRole.Self,
        jwsPublicKey: PUBLIC_KEY,
        jwsSignEnabled: false,
        ...overrides,
    };
}

class FakeMcm {

    readonly published: {fspId: string; key: string}[] = [];

    constructor(private readonly stored: Record<string, string> = {}) {
    }

    getJwsKey(fspId: string): Promise<{publicKey: string} | null> {
        const key = this.stored[fspId];

        return Promise.resolve(key == null ? null : {publicKey: key});
    }

    publishAndVerifyJwsKey(fspId: string, key: string): Promise<void> {
        this.published.push({fspId, key});
        return Promise.resolve();
    }
}

class FakeKeys {

    readonly saved: any[] = [];

    constructor(private readonly rows: any[] = []) {
    }

    findByFspId(fspId: string): Promise<any | null> {
        return Promise.resolve(this.rows.find(r => r.fspId === fspId) ?? null);
    }

    save(entity: any): Promise<any> {
        this.saved.push(entity);
        return Promise.resolve(entity);
    }
}

const lock = {acquire: () => Promise.resolve('token')} as any;

function scheduler(mcm: FakeMcm, keys: FakeKeys): JwsKeyPublishScheduler {
    return new JwsKeyPublishScheduler(mcm as any, keys as any, lock);
}

describe('JwsKeyPublishScheduler.publishAndEnable', () => {

    it('should publish the key before enabling signing', async () => {
        const mcm = new FakeMcm();
        const row = tenant();
        const keys = new FakeKeys([row]);

        await scheduler(mcm, keys).publishAndEnable('DemoDFSP1');

        // Order is the point. A tenant enabled before MCM holds its key signs with something no
        // peer can verify, and that surfaces as a rejected transfer rather than as a provisioning
        // fault.
        assert.deepEqual(mcm.published, [{fspId: 'DemoDFSP1', key: PUBLIC_KEY}]);
        assert.equal(row.jwsSignEnabled, true);
        assert.equal(keys.saved.length, 1);
    });

    it('should enable without republishing when MCM already holds the same key', async () => {
        // The redelivery case: JetStream may deliver twice, and the second pass must not look like
        // a rotation.
        const mcm = new FakeMcm({DemoDFSP1: PUBLIC_KEY});
        const row = tenant();

        await scheduler(mcm, new FakeKeys([row])).publishAndEnable('DemoDFSP1');

        assert.deepEqual(mcm.published, []);
        assert.equal(row.jwsSignEnabled, true);
    });

    it('should refuse when MCM holds a different key, and not enable signing', async () => {
        // Peers hold one key each and cannot try both, so silently replacing breaks every peer
        // that has not re-pulled. Which key is current is a human decision.
        const mcm = new FakeMcm({DemoDFSP1: OTHER_KEY});
        const row = tenant();
        const keys = new FakeKeys([row]);

        await assert.rejects(
            scheduler(mcm, keys).publishAndEnable('DemoDFSP1'),
            /different signing key/);

        assert.deepEqual(mcm.published, []);
        assert.equal(row.jwsSignEnabled, false);
        assert.equal(keys.saved.length, 0);
    });

    it('should not write when signing is already on', async () => {
        const mcm = new FakeMcm({DemoDFSP1: PUBLIC_KEY});
        const keys = new FakeKeys([tenant({jwsSignEnabled: true})]);

        await scheduler(mcm, keys).publishAndEnable('DemoDFSP1');

        assert.equal(keys.saved.length, 0, 'an already-enabled tenant needs no update');
    });

    it('should reject a tenant that is not ours to sign for', async () => {
        const keys = new FakeKeys([tenant({role: ParticipantKeyRole.Peer})]);

        await assert.rejects(
            scheduler(new FakeMcm(), keys).publishAndEnable('DemoDFSP1'),
            /No self-role public key/);
    });

    it('should reject an unknown tenant rather than enabling nothing quietly', async () => {
        await assert.rejects(
            scheduler(new FakeMcm(), new FakeKeys()).publishAndEnable('DemoDFSP1'),
            /No self-role public key/);
    });
});
