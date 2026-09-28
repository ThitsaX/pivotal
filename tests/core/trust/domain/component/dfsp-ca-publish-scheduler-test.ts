import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
    DfspCaPublishScheduler,
} from '../../../../../packages/core/trust/domain/component/dfsp-ca-publish.scheduler';

const INTERMEDIATE = '-----BEGIN CERTIFICATE-----\nintermediate\n-----END CERTIFICATE-----';
const ROOT = '-----BEGIN CERTIFICATE-----\nroot\n-----END CERTIFICATE-----';

const SETTINGS = new DfspCaPublishScheduler.Settings(
    'pki_dfsp', 'pki_dfsp_root', 'istio-ingress-ext', 'dfsp-ca');

class FakeVault {

    readonly reads: string[] = [];

    constructor(private readonly chains: Record<string, string | null>) {
    }

    readPkiCaChain(mount: string): Promise<string | null> {
        this.reads.push(mount);
        return Promise.resolve(this.chains[mount] ?? null);
    }
}

class FakeSecrets {

    readonly writes: {name: string; data: Record<string, string>; namespace?: string}[] = [];

    putIfChanged(name: string, data: Record<string, string>, namespace?: string): Promise<boolean> {
        this.writes.push({name, data, namespace});
        return Promise.resolve(true);
    }
}

const lock = {acquire: () => Promise.resolve(true)} as any;

function scheduler(vault: FakeVault, secrets: FakeSecrets, settings = SETTINGS): DfspCaPublishScheduler {
    return new DfspCaPublishScheduler(vault as any, secrets as any, lock, settings);
}

describe('DfspCaPublishScheduler', () => {

    it('should publish the intermediate followed by the root', async () => {
        const vault = new FakeVault({pki_dfsp: INTERMEDIATE, pki_dfsp_root: ROOT});
        const secrets = new FakeSecrets();

        assert.equal(await scheduler(vault, secrets).sync(), true);

        const written = secrets.writes[0];

        // Both are needed: the issuing mount's own chain contains only itself, so a bundle taken
        // from one alone leaves the gateway unable to build a path from a leaf to an anchor.
        assert.ok(written.data.cacert.indexOf('intermediate') < written.data.cacert.indexOf('root'));
        assert.ok(written.data.cacert.includes('intermediate'));
        assert.ok(written.data.cacert.includes('root'));
    });

    it('should write into the gateway namespace, under the key Istio reads', async () => {
        const vault = new FakeVault({pki_dfsp: INTERMEDIATE, pki_dfsp_root: ROOT});
        const secrets = new FakeSecrets();

        await scheduler(vault, secrets).sync();

        assert.equal(secrets.writes[0].namespace, 'istio-ingress-ext');
        assert.equal(secrets.writes[0].name, 'dfsp-ca');
        assert.deepEqual(Object.keys(secrets.writes[0].data), ['cacert']);
    });

    it('should publish the intermediate alone when no root mount is configured', async () => {
        const vault = new FakeVault({pki_dfsp: INTERMEDIATE});
        const secrets = new FakeSecrets();
        const settings = new DfspCaPublishScheduler.Settings(
            'pki_dfsp', '', 'istio-ingress-ext', 'dfsp-ca');

        assert.equal(await scheduler(vault, secrets, settings).sync(), true);
        assert.ok(secrets.writes[0].data.cacert.includes('intermediate'));
        assert.deepEqual(vault.reads, ['pki_dfsp'], 'must not read a mount it was not given');
    });

    it('should leave the published bundle alone when Vault has no certificate', async () => {
        const vault = new FakeVault({});
        const secrets = new FakeSecrets();

        // Reachable before the CA ceremony has run. Writing an empty anchor would be worse than
        // writing nothing: the gateway would reject every DFSP rather than keep what it holds.
        assert.equal(await scheduler(vault, secrets).sync(), false);
        assert.equal(secrets.writes.length, 0);
    });

    it('should stay idle when no gateway is configured', () => {
        const idle = new DfspCaPublishScheduler.Settings('pki_dfsp', 'pki_dfsp_root', '', '');

        assert.equal(idle.isConfigured(), false);
        assert.equal(SETTINGS.isConfigured(), true);
    });

    it('should not schedule anything when it is not configured', () => {
        const vault = new FakeVault({pki_dfsp: INTERMEDIATE});
        const secrets = new FakeSecrets();
        const idle = new DfspCaPublishScheduler.Settings('pki_dfsp', 'pki_dfsp_root', '', '');
        const job = scheduler(vault, secrets, idle);

        job.onModuleInit();
        job.onModuleDestroy();

        assert.equal(vault.reads.length, 0);
        assert.equal(secrets.writes.length, 0);
    });
});
