import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {McmException} from '../../../../../packages/shared/mcm-client/exception';
import {
    McmDfspRegistrar,
} from '../../../../../packages/core/trust/domain/component/mcm-dfsp.registrar';

/**
 * Shaped like MCM v3.7: `GET /dfsps` lists DFSPs with the identifier as `id`, and there is no
 * `GET /dfsps/{dfspId}` -- calling it fails the test.
 */
class FakeMcm {

    readonly calls: string[] = [];
    readonly created: Record<string, unknown>[] = [];
    listFailure: McmException | null = null;
    createFails = false;
    onCreate: ((dfspId: string) => void) | null = null;

    constructor(private readonly dfsps: Set<string> = new Set()) {
    }

    listDfsps(): Promise<{id: string; name: string}[]> {
        this.calls.push('list');

        if (this.listFailure != null) {
            return Promise.reject(this.listFailure);
        }

        return Promise.resolve([...this.dfsps].map(id => ({id, name: id})));
    }

    getDfsp(): Promise<never> {
        return Promise.reject(new McmException('MCM_REQUEST_FAILED', 'GET method not allowed', 405));
    }

    createDfsp(body: {dfspId: string}): Promise<{id: string}> {
        this.calls.push(`create:${body.dfspId}`);
        this.created.push(body);
        this.onCreate?.(body.dfspId);

        if (this.createFails) {
            return Promise.reject(new McmException('MCM_REQUEST_FAILED', 'duplicate', 500));
        }

        this.dfsps.add(body.dfspId);
        return Promise.resolve({id: body.dfspId});
    }
}

function registrar(mcm: FakeMcm, settings: Partial<McmDfspRegistrar.Settings> = {}): McmDfspRegistrar {
    return new McmDfspRegistrar(mcm as any, {enabled: true, ...settings});
}

describe('McmDfspRegistrar', () => {

    it('does nothing at all when switched off', async () => {
        const mcm = new FakeMcm();

        assert.equal(await registrar(mcm, {enabled: false}).ensureRegistered('DemoDFSP1'), 'disabled');
        assert.deepEqual(mcm.calls, []);
    });

    it('finds an existing DFSP on the list, and answers for every listed DFSP from that one read', async () => {
        const mcm = new FakeMcm(new Set(['DemoDFSP1', 'DemoDFSP2', 'pivotal']));
        const subject = registrar(mcm);

        assert.equal(await subject.ensureRegistered('DemoDFSP1'), 'present');
        assert.equal(await subject.ensureRegistered('DemoDFSP2'), 'present');
        assert.equal(await subject.ensureRegistered('pivotal'), 'present');
        assert.deepEqual(mcm.calls, ['list']);
    });

    it('creates a DFSP MCM does not have, named after its id', async () => {
        const mcm = new FakeMcm(new Set(['pivotal']));
        const subject = registrar(mcm);

        assert.equal(await subject.ensureRegistered('GreenBank'), 'created');
        assert.deepEqual(mcm.created, [{dfspId: 'GreenBank', name: 'GreenBank'}]);

        // Remembered once created, so the next job to need it costs nothing.
        assert.equal(await subject.ensureRegistered('GreenBank'), 'present');
        assert.deepEqual(mcm.calls, ['list', 'create:GreenBank']);
    });

    it('sends the contact address and monetary zone only when they are configured', async () => {
        const mcm = new FakeMcm();

        await registrar(mcm, {contactEmail: 'ops@example.com', monetaryZoneId: 'USD'}).ensureRegistered('GreenBank');

        assert.deepEqual(mcm.created, [{dfspId: 'GreenBank', name: 'GreenBank', email: 'ops@example.com', monetaryZoneId: 'USD'}]);
    });

    it('treats a refused create as success when the DFSP turns out to exist', async () => {
        const mcm = new FakeMcm();
        mcm.createFails = true;
        // Another replica created it between the check and the create.
        mcm.onCreate = dfspId => (mcm as any).dfsps.add(dfspId);

        assert.equal(await registrar(mcm).ensureRegistered('GreenBank'), 'present');
    });

    it('surfaces a create that fails for any other reason', async () => {
        const mcm = new FakeMcm();
        mcm.createFails = true;

        await assert.rejects(registrar(mcm).ensureRegistered('GreenBank'), /duplicate/);
    });

    it('does not create anything when it cannot read the list', async () => {
        const mcm = new FakeMcm();
        mcm.listFailure = new McmException('MCM_REQUEST_FAILED', 'MCM unavailable', 503);

        await assert.rejects(registrar(mcm).ensureRegistered('GreenBank'), /MCM unavailable/);
        assert.equal(mcm.created.length, 0);
    });
});
