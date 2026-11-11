import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {describe, it} from 'node:test';
import {
    McmCaRegistrationScheduler,
} from '../../../../../packages/core/trust/domain/component/mcm-ca-registration.scheduler';

const ROOT = '-----BEGIN CERTIFICATE-----\nroot\n-----END CERTIFICATE-----\n';
const INTERMEDIATE = '-----BEGIN CERTIFICATE-----\nintermediate\n-----END CERTIFICATE-----';

const caPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mcm-ca-')), 'ca.pem');
fs.writeFileSync(caPath, ROOT);

type Ca = {rootCertificate?: string; intermediateChain?: string};

class FakeMcm {

    readonly registered: {dfspId: string; body: Ca}[] = [];

    constructor(private readonly held: Record<string, Ca> = {}) {
    }

    getDfspCa(dfspId: string): Promise<Ca> {
        return this.held[dfspId] == null ? Promise.reject(new Error('404')) : Promise.resolve(this.held[dfspId]);
    }

    registerCa(dfspId: string, body: Ca): Promise<unknown> {
        this.registered.push({dfspId, body});
        return Promise.resolve({});
    }
}

const participantKeys = {
    findAll: () => Promise.resolve([
        {fspId: 'DemoDFSP1', role: 'self'},
        {fspId: 'DemoDFSP2', role: 'self'},
        {fspId: 'peer1', role: 'peer'},
    ]),
} as any;

const lock = {acquire: () => Promise.resolve('token'), release: () => Promise.resolve()} as any;

function scheduler(
    mcm: FakeMcm,
    intermediates: () => Promise<string | null>,
    pivotalDfspId: string | null = 'pivotal',
): McmCaRegistrationScheduler {
    return new McmCaRegistrationScheduler(mcm as any, participantKeys, lock, caPath, intermediates, pivotalDfspId);
}

describe('McmCaRegistrationScheduler', () => {

    it('registers root and intermediate under every tenant and under Pivotal itself', async () => {
        const mcm = new FakeMcm();

        const result = await scheduler(mcm, () => Promise.resolve(INTERMEDIATE)).reconcile();

        assert.deepEqual(mcm.registered.map(r => r.dfspId), ['DemoDFSP1', 'DemoDFSP2', 'pivotal']);
        assert.deepEqual(mcm.registered[2].body, {rootCertificate: ROOT, intermediateChain: INTERMEDIATE});
        assert.equal(result.registered, 3);
    });

    it('leaves a registration that already holds both alone', async () => {
        const held = {rootCertificate: ROOT, intermediateChain: INTERMEDIATE};
        const mcm = new FakeMcm({DemoDFSP1: held, DemoDFSP2: held, pivotal: held});

        const result = await scheduler(mcm, () => Promise.resolve(INTERMEDIATE)).reconcile();

        assert.equal(mcm.registered.length, 0);
        assert.equal(result.alreadyCorrect, 3);
    });

    it('re-registers a tenant that holds the root without the intermediate', async () => {
        const mcm = new FakeMcm({
            DemoDFSP1: {rootCertificate: ROOT},
            DemoDFSP2: {rootCertificate: ROOT, intermediateChain: INTERMEDIATE},
            pivotal: {rootCertificate: ROOT, intermediateChain: INTERMEDIATE},
        });

        await scheduler(mcm, () => Promise.resolve(INTERMEDIATE)).reconcile();

        assert.deepEqual(mcm.registered.map(r => r.dfspId), ['DemoDFSP1']);
    });

    it('registers the root once, in its own field, when the mount chain includes it', async () => {
        const mcm = new FakeMcm();

        await scheduler(mcm, () => Promise.resolve(`${INTERMEDIATE}\n${ROOT}`)).reconcile();

        assert.equal(mcm.registered[0].body.intermediateChain, INTERMEDIATE);
    });

    it('registers the root alone when there is no intermediate, and treats that as correct', async () => {
        const mcm = new FakeMcm({DemoDFSP1: {rootCertificate: ROOT}});

        await scheduler(mcm, () => Promise.resolve(null), null).reconcile();

        assert.deepEqual(mcm.registered, [{dfspId: 'DemoDFSP2', body: {rootCertificate: ROOT}}]);
    });

    it('registers nothing when the chain cannot be read, rather than a partial registration', async () => {
        const mcm = new FakeMcm();

        await assert.rejects(scheduler(mcm, () => Promise.reject(new Error('vault down'))).reconcile(), /vault down/);
        assert.equal(mcm.registered.length, 0);
    });

    it('creates each DFSP, Pivotal\'s own included, before registering the CA under it', async () => {
        const mcm = new FakeMcm();
        const order: string[] = [];
        const original = mcm.registerCa.bind(mcm);
        mcm.registerCa = (dfspId: string, body: Ca) => {
            order.push(`register:${dfspId}`);
            return original(dfspId, body);
        };
        const registrar = {
            ensureRegistered: (dfspId: string) => {
                order.push(`ensure:${dfspId}`);
                return Promise.resolve('created');
            },
        };

        await new McmCaRegistrationScheduler(
            mcm as any, participantKeys, lock, caPath, () => Promise.resolve(INTERMEDIATE), 'pivotal',
            undefined, registrar as any).reconcile();

        assert.deepEqual(order, [
            'ensure:DemoDFSP1', 'register:DemoDFSP1',
            'ensure:DemoDFSP2', 'register:DemoDFSP2',
            'ensure:pivotal', 'register:pivotal',
        ]);
    });
});

