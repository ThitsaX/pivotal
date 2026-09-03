import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import * as forge from 'node-forge';
import {
    DfspCertificateIssuer,
} from '../../../../../../packages/core/participant/domain/component/cert/dfsp-certificate-issuer';
import {
    ParticipantCertStatusCode,
} from '../../../../../../packages/core/participant/domain/model/participant-cert-status.model';
import {ParticipantCert} from '../../../../../../packages/core/participant/domain/model/participant-cert.model';

const ISSUER_SETTINGS: DfspCertificateIssuer.Settings = {
    mount: 'pki_dfsp',
    role: 'dfsp-client',
    ttl: '8760h',
};

/** Stands in for the DFSP-facing intermediate, so the test signs what Vault would sign. */
class FakeCa {

    private readonly key = forge.pki.rsa.generateKeyPair(2048);

    /** Every request the issuer made, so the test can assert on what was sent. */
    readonly requests: any[] = [];

    signCertificate(request: any): Promise<any> {

        this.requests.push(request);

        const csr = forge.pki.certificationRequestFromPem(request.csrPem);
        const certificate = forge.pki.createCertificate();

        certificate.publicKey = csr.publicKey!;
        certificate.serialNumber = '0a1b2c3d';
        certificate.validity.notBefore = new Date(Date.now() - 60_000);
        certificate.validity.notAfter = new Date(Date.now() + 31_536_000_000);

        // Vault sets the subject from common_name; anything in the CSR's own subject is discarded.
        certificate.setSubject([
            {name: 'commonName', value: request.commonName},
            {name: 'organizationName', value: 'ThitsaWorks'},
        ]);
        certificate.setIssuer([{name: 'commonName', value: 'Pivotal DFSP-Facing CA'}]);
        certificate.sign(this.key.privateKey, forge.md.sha256.create());

        return Promise.resolve({
            certificatePem: forge.pki.certificateToPem(certificate),
            caChainPem: '-----BEGIN CERTIFICATE-----\nchain\n-----END CERTIFICATE-----',
            serialNumber: '0a:1b:2c:3d',
            expiration: certificate.validity.notAfter,
        });
    }
}

/**
 * A CA that takes the subject from the request, which is what Vault's PKI role does by default
 * (`use_csr_common_name=true`). The original FakeCa encoded the intended behaviour rather than the
 * real one, and so could never have caught it.
 */
class SubjectHonouringCa extends FakeCa {

    signCertificate(request: any): Promise<any> {
        const csr = forge.pki.certificationRequestFromPem(request.csrPem);
        const claimed = csr.subject.getField('CN')?.value as string;

        return super.signCertificate({...request, commonName: claimed});
    }
}

class FakeCertRepository {

    readonly saved: ParticipantCert[] = [];

    private usable: ParticipantCert[] = [];

    withUsable(certificates: ParticipantCert[]): this {
        this.usable = certificates;
        return this;
    }

    findUsableByFspId(): Promise<ParticipantCert[]> {
        return Promise.resolve(this.usable);
    }

    save(entity: ParticipantCert): Promise<ParticipantCert> {
        this.saved.push(entity);
        return Promise.resolve(entity);
    }
}

/** A request whose subject deliberately claims a different tenant. */
function csrClaiming(commonName: string, bits = 2048): string {

    const pair = forge.pki.rsa.generateKeyPair(bits);
    const csr = forge.pki.createCertificationRequest();

    csr.publicKey = pair.publicKey;
    csr.setSubject([{name: 'commonName', value: commonName}]);
    csr.sign(pair.privateKey, forge.md.sha256.create());

    return forge.pki.certificationRequestToPem(csr);
}

function issuerWith(ca: FakeCa, repository: FakeCertRepository): DfspCertificateIssuer {
    return new DfspCertificateIssuer(ca as any, repository as any, ISSUER_SETTINGS);
}

describe('DfspCertificateIssuer', () => {

    it('should force the common name to the enrolled tenant, ignoring the one in the request', async () => {
        const ca = new FakeCa();
        const repository = new FakeCertRepository();

        const issued = await issuerWith(ca, repository).issue({
            fspId: 'dfsp-a',
            csrPem: csrClaiming('dfsp-b'),
        });

        assert.equal(ca.requests[0].commonName, 'dfsp-a');
        assert.ok(issued.subject.includes('CN=dfsp-a'));
        assert.ok(!issued.subject.includes('dfsp-b'));
    });

    it('should ask Vault to sign rather than to issue, so no private key is generated', async () => {
        const ca = new FakeCa();

        await issuerWith(ca, new FakeCertRepository()).issue({
            fspId: 'dfsp-a',
            csrPem: csrClaiming('dfsp-a'),
        });

        // The endpoint is chosen inside VaultClient from this shape; what the issuer must get right
        // is that it hands over a CSR and never asks for key generation.
        assert.equal(ca.requests[0].mount, 'pki_dfsp');
        assert.equal(ca.requests[0].role, 'dfsp-client');
        assert.ok(ca.requests[0].csrPem.includes('CERTIFICATE REQUEST'));
    });

    it('should record the fingerprint a TLS peer would present', async () => {
        const ca = new FakeCa();
        const repository = new FakeCertRepository();

        const issued = await issuerWith(ca, repository).issue({
            fspId: 'dfsp-a',
            csrPem: csrClaiming('dfsp-a'),
        });

        // Recomputed independently from the stored PEM: this value is the runtime lookup key, so a
        // fingerprint derived from anything other than the certificate's own DER would resolve
        // nothing at handshake time.
        const der = forge.asn1
            .toDer(forge.pki.certificateToAsn1(forge.pki.certificateFromPem(issued.certPem)))
            .getBytes();
        const expected = forge.md.sha256.create().update(der).digest().toHex();

        assert.equal(issued.fingerprintSha256, expected);
        assert.equal(issued.fingerprintSha256.length, 64);
    });

    it('should record what was issued, active and with its chain', async () => {
        const ca = new FakeCa();
        const repository = new FakeCertRepository();

        const issued = await issuerWith(ca, repository).issue({
            fspId: 'dfsp-a',
            csrPem: csrClaiming('dfsp-a'),
            note: 'ticket 4711',
        });

        assert.equal(issued.status, ParticipantCertStatusCode.ACTIVE);
        assert.equal(issued.fspId, 'dfsp-a');
        assert.equal(issued.serial, '0a:1b:2c:3d');
        assert.equal(issued.note, 'ticket 4711');
        assert.ok(issued.caChainPem != null);
        assert.ok(issued.validTo.getTime() > Date.now());
        assert.equal(repository.saved.at(-1), issued);
    });

    it('should retire what the tenant already holds rather than revoking it', async () => {
        const previous = new ParticipantCert();

        previous.fspId = 'dfsp-a';
        previous.status = ParticipantCertStatusCode.ACTIVE;

        const repository = new FakeCertRepository().withUsable([previous]);

        await issuerWith(new FakeCa(), repository).issue({
            fspId: 'dfsp-a',
            csrPem: csrClaiming('dfsp-a'),
        });

        // Retiring rather than revoking is what lets a DFSP install the new certificate on its own
        // schedule: the old one keeps working until it expires.
        assert.equal(previous.status, ParticipantCertStatusCode.RETIRING);
        assert.ok(repository.saved.includes(previous));
    });

    it('should refuse a certificate the authority named after the request, not the tenant', async () => {
        const ca = new SubjectHonouringCa();
        const repository = new FakeCertRepository();

        // Exactly the live failure: a Vault role left at use_csr_common_name=true issues a
        // certificate the DFSP has named itself, which defeats the binding rule silently.
        await assert.rejects(
            issuerWith(ca, repository).issue({fspId: 'dfsp-a', csrPem: csrClaiming('dfsp-b')}),
            /issued a certificate for 'dfsp-b' when 'dfsp-a' was requested/);

        assert.equal(repository.saved.length, 0, 'a mis-bound certificate must not be recorded');
    });

    it('should refuse a request that is not a certificate signing request', async () => {
        const ca = new FakeCa();

        await assert.rejects(
            issuerWith(ca, new FakeCertRepository()).issue({fspId: 'dfsp-a', csrPem: 'not a csr'}),
            /could not be read/);

        assert.equal(ca.requests.length, 0, 'a malformed request must never reach the CA');
    });

    it('should refuse a key smaller than the issuing role accepts', async () => {
        const ca = new FakeCa();

        await assert.rejects(
            issuerWith(ca, new FakeCertRepository()).issue({
                fspId: 'dfsp-a',
                csrPem: csrClaiming('dfsp-a', 1024),
            }),
            /too small/);

        assert.equal(ca.requests.length, 0);
    });

    it('should not leak Vault detail when signing fails', async () => {
        const failing = {
            requests: [],
            signCertificate: () => Promise.reject(
                new Error('permission denied on pki_dfsp/sign/dfsp-client for role foo')),
        };

        await assert.rejects(
            new DfspCertificateIssuer(failing as any, new FakeCertRepository() as any, ISSUER_SETTINGS)
                .issue({fspId: 'dfsp-a', csrPem: csrClaiming('dfsp-a')}),
            (error: Error) => {
                assert.ok(!error.message.includes('pki_dfsp'), 'must not name the Vault path');
                assert.ok(!error.message.includes('permission denied'));
                assert.match(error.message, /could not be issued/);
                return true;
            });
    });
});
