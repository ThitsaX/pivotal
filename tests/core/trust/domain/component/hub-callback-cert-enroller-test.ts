import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import * as forge from 'node-forge';
import {
    HubCallbackCertEnroller,
} from '../../../../../packages/core/trust/domain/component/hub-callback-cert.enroller';

const NOW = new Date('2026-10-04T00:00:00Z');
const DAY_MS = 86_400_000;

const KEYS = forge.pki.rsa.generateKeyPair({bits: 1024});

/** A certificate that expires the given number of days after NOW. */
function certificateExpiringIn(days: number): string {
    const certificate = forge.pki.createCertificate();
    certificate.publicKey = KEYS.publicKey;
    certificate.serialNumber = '01';
    certificate.validity.notBefore = new Date(NOW.getTime() - DAY_MS);
    certificate.validity.notAfter = new Date(NOW.getTime() + days * DAY_MS);
    certificate.setSubject([{name: 'commonName', value: 'web-inbound.example'}]);
    certificate.setIssuer([{name: 'commonName', value: 'web-inbound.example'}]);
    certificate.sign(KEYS.privateKey, forge.md.sha256.create());

    return forge.pki.certificateToPem(certificate);
}

const SETTINGS: HubCallbackCertEnroller.Settings = {
    dfspId: 'pivotal',
    commonName: 'web-inbound.example',
    pkiMount: 'pki_hub_client',
    pkiRole: 'hub-callback-client',
    renewBeforeDays: 30,
    intervalMs: DAY_MS,
};

type Enrollment = {id: number; state: string; csr?: string; certificate?: string};

class FakeMcm {

    readonly calls: string[] = [];
    readonly uploads: {id: number | string; certificate: string}[] = [];
    onboardFailures = 0;
    uploadState = 'CERT_SIGNED';
    caRoot: string | undefined = '-----BEGIN CERTIFICATE-----\nroot\n-----END CERTIFICATE-----';

    constructor(public enrollments: Enrollment[]) {
    }

    listOutboundEnrollments(): Promise<Enrollment[]> {
        this.calls.push('list');
        return Promise.resolve(this.enrollments);
    }

    getDfspCa(): Promise<{rootCertificate?: string}> {
        this.calls.push('ca');
        return Promise.resolve({rootCertificate: this.caRoot});
    }

    createOutboundCsr(): Promise<Enrollment> {
        this.calls.push('csr');
        const created = {id: Math.max(0, ...this.enrollments.map(e => e.id)) + 1, state: 'CSR_LOADED', csr: 'NEW-CSR'};
        this.enrollments.push(created);
        return Promise.resolve(created);
    }

    uploadOutboundCertificate(_dfspId: string, id: number | string, certificate: string): Promise<Enrollment> {
        this.calls.push(`upload:${id}`);
        this.uploads.push({id, certificate});
        const enrollment = this.enrollments.find(e => e.id === id)!;
        enrollment.state = this.uploadState;
        enrollment.certificate = certificate;
        return Promise.resolve({...enrollment});
    }

    onboard(): Promise<void> {
        this.calls.push('onboard');

        if (this.onboardFailures > 0) {
            this.onboardFailures -= 1;
            return Promise.reject(new Error('onboard failed'));
        }

        return Promise.resolve();
    }
}

class FakeVault {

    readonly requests: {mount: string; role: string; csrPem: string; commonName: string}[] = [];

    constructor(private readonly issued: string = certificateExpiringIn(365)) {
    }

    signCertificate(request: {mount: string; role: string; csrPem: string; commonName: string}) {
        this.requests.push(request);
        return Promise.resolve({certificatePem: this.issued, serialNumber: '01'});
    }
}

const lock = {acquire: () => Promise.resolve('token'), release: () => Promise.resolve()} as any;

function enroller(mcm: FakeMcm, vault: FakeVault): HubCallbackCertEnroller {
    return new HubCallbackCertEnroller(mcm as any, vault, lock, SETTINGS, () => NOW, () => Promise.resolve());
}

describe('HubCallbackCertEnroller', () => {

    it('does nothing while the current certificate is outside the renewal window', async () => {
        const mcm = new FakeMcm([{id: 2, state: 'CERT_SIGNED', certificate: certificateExpiringIn(60)}]);
        const vault = new FakeVault();

        assert.equal(await enroller(mcm, vault).renewIfNeeded(), 'current');
        assert.deepEqual(mcm.calls, ['list']);
        assert.equal(vault.requests.length, 0);
    });

    it('signs a fresh CSR with the callback host, uploads it, then onboards', async () => {
        const mcm = new FakeMcm([]);
        const vault = new FakeVault();

        assert.equal(await enroller(mcm, vault).renewIfNeeded(), 'renewed');

        assert.deepEqual(mcm.calls, ['list', 'ca', 'csr', 'upload:1', 'onboard']);
        // The common name is what MCM uses as the callback address; the CSR's subject is empty.
        assert.deepEqual(vault.requests[0], {
            mount: 'pki_hub_client', role: 'hub-callback-client', csrPem: 'NEW-CSR', commonName: 'web-inbound.example',
        });
        assert.ok(mcm.uploads[0].certificate.includes('BEGIN CERTIFICATE'));
    });

    it('renews inside the window, reusing a CSR an earlier attempt left unsigned', async () => {
        const mcm = new FakeMcm([
            {id: 2, state: 'CERT_SIGNED', certificate: certificateExpiringIn(10)},
            {id: 3, state: 'CSR_LOADED', csr: 'LEFT-OVER-CSR'},
        ]);
        const vault = new FakeVault();

        assert.equal(await enroller(mcm, vault).renewIfNeeded(), 'renewed');

        assert.deepEqual(mcm.calls, ['list', 'ca', 'upload:3', 'onboard']);
        assert.equal(vault.requests[0].csrPem, 'LEFT-OVER-CSR');
    });

    it('ignores a CSR older than the current certificate and asks for a new one', async () => {
        const mcm = new FakeMcm([
            {id: 1, state: 'CSR_LOADED', csr: 'STALE-CSR'},
            {id: 2, state: 'CERT_SIGNED', certificate: certificateExpiringIn(10)},
        ]);
        const vault = new FakeVault();

        await enroller(mcm, vault).renewIfNeeded();

        assert.deepEqual(mcm.calls, ['list', 'ca', 'csr', 'upload:3', 'onboard']);
        assert.equal(vault.requests[0].csrPem, 'NEW-CSR');
    });

    it('keeps publishing pending after onboarding fails, and publishes on the next run', async () => {
        const mcm = new FakeMcm([]);
        mcm.onboardFailures = 3;
        const subject = enroller(mcm, new FakeVault());

        await assert.rejects(subject.renewIfNeeded(), /onboarding 'pivotal' failed/);
        assert.equal(mcm.calls.filter(call => call === 'onboard').length, 3);

        // The uploaded certificate is valid now, so only the pending flag makes this run publish it.
        mcm.calls.length = 0;
        assert.equal(await subject.renewIfNeeded(), 'published');
        assert.deepEqual(mcm.calls, ['list', 'ca', 'onboard']);

        mcm.calls.length = 0;
        assert.equal(await subject.renewIfNeeded(), 'current');
    });

    it('waits, signing nothing, until Pivotal\'s CA is registered under its DFSP', async () => {
        const mcm = new FakeMcm([]);
        mcm.caRoot = undefined;
        const vault = new FakeVault();
        const subject = enroller(mcm, vault);

        // Onboarding now would hand the Hub no anchor for web-inbound, and nothing would
        // onboard again until the next renewal.
        assert.equal(await subject.renewIfNeeded(), 'waiting-for-ca');
        assert.deepEqual(mcm.calls, ['list', 'ca']);
        assert.equal(vault.requests.length, 0);

        mcm.caRoot = '-----BEGIN CERTIFICATE-----\nroot\n-----END CERTIFICATE-----';
        assert.equal(await subject.renewIfNeeded(), 'renewed');
    });

    it('does not onboard when MCM does not accept the certificate', async () => {
        const mcm = new FakeMcm([]);
        mcm.uploadState = 'CSR_LOADED';

        await assert.rejects(enroller(mcm, new FakeVault()).renewIfNeeded(), /did not accept/);
        assert.ok(!mcm.calls.includes('onboard'));
    });
});
