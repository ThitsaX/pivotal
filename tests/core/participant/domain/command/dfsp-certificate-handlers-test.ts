import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
    EnrollDfspCertificateCommand,
} from '../../../../../packages/core/participant/domain/command/enroll-dfsp-certificate.command';
import {
    EnrollDfspCertificateHandler,
} from '../../../../../packages/core/participant/domain/command/enroll-dfsp-certificate.handler';
import {
    RevokeDfspCertificateCommand,
} from '../../../../../packages/core/participant/domain/command/revoke-dfsp-certificate.command';
import {
    RevokeDfspCertificateHandler,
} from '../../../../../packages/core/participant/domain/command/revoke-dfsp-certificate.handler';
import {
    ParticipantCertStatusCode,
} from '../../../../../packages/core/participant/domain/model/participant-cert-status.model';
import {ParticipantCert} from '../../../../../packages/core/participant/domain/model/participant-cert.model';

class FakeIssuer {

    readonly issued: any[] = [];

    issue(request: any): Promise<ParticipantCert> {

        this.issued.push(request);

        const certificate = new ParticipantCert();

        certificate.id = '1';
        certificate.fspId = request.fspId;
        certificate.serial = '0a:1b';
        certificate.fingerprintSha256 = 'f'.repeat(64);
        certificate.subject = `CN=${request.fspId}`;
        certificate.certPem = 'cert';
        certificate.caChainPem = 'chain';
        certificate.status = ParticipantCertStatusCode.ACTIVE;
        certificate.validFrom = new Date();
        certificate.validTo = new Date(Date.now() + 1000);

        return Promise.resolve(certificate);
    }
}

class FakeParticipants {

    constructor(private readonly known: string[]) {
    }

    findByName(name: string): Promise<{name: string} | null> {
        return Promise.resolve(this.known.includes(name) ? {name} : null);
    }
}

class FakeCertRepository {

    readonly saved: ParticipantCert[] = [];

    readonly deleted: string[] = [];

    constructor(private readonly rows: ParticipantCert[] = []) {
    }

    findById(id: string): Promise<ParticipantCert | null> {
        return Promise.resolve(this.rows.find(row => row.id === id) ?? null);
    }

    save(entity: ParticipantCert): Promise<ParticipantCert> {
        this.saved.push(entity);
        return Promise.resolve(entity);
    }
}

function certificate(id: string, status: string): ParticipantCert {

    const row = new ParticipantCert();

    row.id = id;
    row.fspId = 'dfsp-a';
    row.status = status;
    row.revokedAt = null;
    row.note = null;

    return row;
}

describe('EnrollDfspCertificateHandler', () => {

    it('should issue for a participant that exists', async () => {
        const issuer = new FakeIssuer();
        const handler = new EnrollDfspCertificateHandler(
            issuer as any, new FakeParticipants(['dfsp-a']) as any);

        const output = await handler.execute(new EnrollDfspCertificateCommand(
            new EnrollDfspCertificateCommand.Input('dfsp-a', 'csr', 'ticket 1')));

        assert.equal(output.fspId, 'dfsp-a');
        assert.equal(output.certPem, 'cert');
        assert.equal(output.caChainPem, 'chain', 'the chain must be returned with the certificate');
        assert.equal(issuer.issued.length, 1);
    });

    it('should refuse a participant that does not exist, without issuing', async () => {
        const issuer = new FakeIssuer();
        const handler = new EnrollDfspCertificateHandler(
            issuer as any, new FakeParticipants([]) as any);

        // A certificate whose common name resolves to no participant would pass the checks at the
        // edge and then bind to nothing.
        await assert.rejects(
            handler.execute(new EnrollDfspCertificateCommand(
                new EnrollDfspCertificateCommand.Input('ghost', 'csr'))),
            /No participant is registered/);

        assert.equal(issuer.issued.length, 0);
    });

    it('should say plainly when the deployment issues no certificates', async () => {
        const handler = new EnrollDfspCertificateHandler(
            null, new FakeParticipants(['dfsp-a']) as any);

        await assert.rejects(
            handler.execute(new EnrollDfspCertificateCommand(
                new EnrollDfspCertificateCommand.Input('dfsp-a', 'csr'))),
            /does not issue DFSP certificates/);
    });

    it('should trim the identifier before it reaches the certificate subject', async () => {
        const issuer = new FakeIssuer();
        const handler = new EnrollDfspCertificateHandler(
            issuer as any, new FakeParticipants(['dfsp-a']) as any);

        await handler.execute(new EnrollDfspCertificateCommand(
            new EnrollDfspCertificateCommand.Input('  dfsp-a  ', ' csr ')));

        assert.equal(issuer.issued[0].fspId, 'dfsp-a');
        assert.equal(issuer.issued[0].csrPem, 'csr');
    });
});

describe('RevokeDfspCertificateHandler', () => {

    it('should mark the row revoked and keep it', async () => {
        const row = certificate('1', ParticipantCertStatusCode.ACTIVE);
        const repository = new FakeCertRepository([row]);
        const handler = new RevokeDfspCertificateHandler(repository as any);

        const output = await handler.execute(new RevokeDfspCertificateCommand(
            new RevokeDfspCertificateCommand.Input('1', 'key exposed')));

        assert.equal(output.status, ParticipantCertStatusCode.REVOKED);
        assert.ok(output.revokedAt instanceof Date);

        // Retained on purpose: a revoked certificate whose row is gone becomes a lookup miss, which
        // is indistinguishable from one this deployment never issued.
        assert.equal(repository.deleted.length, 0);
        assert.equal(repository.saved.at(-1), row);
    });

    it('should keep the enrollment note alongside the revocation reason', async () => {
        const row = certificate('1', ParticipantCertStatusCode.ACTIVE);

        row.note = 'ticket 1';

        const handler = new RevokeDfspCertificateHandler(new FakeCertRepository([row]) as any);

        await handler.execute(new RevokeDfspCertificateCommand(
            new RevokeDfspCertificateCommand.Input('1', 'key exposed')));

        assert.match(row.note!, /ticket 1/);
        assert.match(row.note!, /key exposed/);
    });

    it('should refuse a second revocation', async () => {
        const row = certificate('1', ParticipantCertStatusCode.REVOKED);
        const handler = new RevokeDfspCertificateHandler(new FakeCertRepository([row]) as any);

        await assert.rejects(
            handler.execute(new RevokeDfspCertificateCommand(
                new RevokeDfspCertificateCommand.Input('1'))),
            /already been revoked/);
    });

    it('should revoke a retiring certificate, not only an active one', async () => {
        const row = certificate('1', ParticipantCertStatusCode.RETIRING);
        const handler = new RevokeDfspCertificateHandler(new FakeCertRepository([row]) as any);

        // A superseded certificate is still presentable until it expires, so withdrawing one has to
        // remain possible.
        const output = await handler.execute(new RevokeDfspCertificateCommand(
            new RevokeDfspCertificateCommand.Input('1')));

        assert.equal(output.status, ParticipantCertStatusCode.REVOKED);
    });

    it('should report a certificate that does not exist', async () => {
        const handler = new RevokeDfspCertificateHandler(new FakeCertRepository([]) as any);

        await assert.rejects(
            handler.execute(new RevokeDfspCertificateCommand(
                new RevokeDfspCertificateCommand.Input('404'))),
            /No certificate was found/);
    });
});
