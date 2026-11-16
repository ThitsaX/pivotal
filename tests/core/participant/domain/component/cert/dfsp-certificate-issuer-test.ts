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

/**
 * Stands in for the DFSP-facing intermediate signing verbatim, the way Vault does: the subject comes
 * from the request, usage comes from the call, and every requested extension except basic
 * constraints is copied across on top.
 */
class FakeCa {

    protected readonly key = forge.pki.rsa.generateKeyPair(2048);

    /** Every request the issuer made, so the test can assert on what was sent. */
    readonly requests: any[] = [];

    signCertificateVerbatim(request: any): Promise<any> {

        this.requests.push(request);

        const csr = forge.pki.certificationRequestFromPem(request.csrPem);
        const certificate = forge.pki.createCertificate();

        certificate.publicKey = this.publicKeyFor(csr);
        certificate.serialNumber = '0a1b2c3d';
        certificate.validity.notBefore = new Date(Date.now() - 60_000);
        certificate.validity.notAfter = new Date(Date.now() + 31_536_000_000);
        certificate.setSubject(csr.subject.attributes);
        certificate.setIssuer([{name: 'commonName', value: 'Pivotal DFSP-Facing CA'}]);

        const requested = (csr.getAttribute({name: 'extensionRequest'}) as any)?.extensions ?? [];
        const copied = requested.filter((extension: any) => extension.name !== 'basicConstraints');
        const copiedNames = new Set(copied.map((extension: any) => extension.name));

        certificate.setExtensions([
            ...this.usageExtensions(request).filter(extension => !copiedNames.has(extension.name)),
            ...copied,
        ]);
        certificate.sign(this.key.privateKey, forge.md.sha256.create());

        return Promise.resolve({
            certificatePem: forge.pki.certificateToPem(certificate),
            caChainPem: '-----BEGIN CERTIFICATE-----\nchain\n-----END CERTIFICATE-----',
            serialNumber: '0a:1b:2c:3d',
            expiration: certificate.validity.notAfter,
        });
    }

    protected publicKeyFor(csr: forge.pki.CertificateSigningRequest): forge.pki.PublicKey {
        return csr.publicKey!;
    }

    protected usageExtensions(request: any): any[] {
        return [
            {name: 'basicConstraints', cA: false},
            {
                name: 'extKeyUsage',
                clientAuth: request.extKeyUsage.includes('ClientAuth'),
                serverAuth: request.extKeyUsage.includes('ServerAuth'),
            },
        ];
    }
}

/** A CA that ignores the usage it was asked for, as a role or version change could. */
class ServerUsageCa extends FakeCa {
    protected usageExtensions(): any[] {
        return [{name: 'basicConstraints', cA: false}, {name: 'extKeyUsage', serverAuth: true}];
    }
}

/** A CA that signs something other than the submitted key. */
class SwappedKeyCa extends FakeCa {
    protected publicKeyFor(): forge.pki.PublicKey {
        return this.key.publicKey;
    }
}

/** A CA that marks the leaf as an authority. */
class AuthorityCa extends FakeCa {
    protected usageExtensions(): any[] {
        return [{name: 'basicConstraints', cA: true}, {name: 'extKeyUsage', clientAuth: true}];
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

/** A request with the given subject and, optionally, requested extensions. */
function csrWith(
    subject: forge.pki.CertificateField[],
    options: {bits?: number; extensions?: any[]} = {},
): string {

    const pair = forge.pki.rsa.generateKeyPair(options.bits ?? 2048);
    const csr = forge.pki.createCertificationRequest();

    csr.publicKey = pair.publicKey;
    csr.setSubject(subject);

    if (options.extensions != null) {
        csr.setAttributes([{name: 'extensionRequest', extensions: options.extensions}]);
    }

    csr.sign(pair.privateKey, forge.md.sha256.create());

    return forge.pki.certificationRequestToPem(csr);
}

/** The shape of the request that started this: a country and a hostname, nothing else. */
function hostnameCsr(options: {bits?: number; extensions?: any[]} = {}): string {
    return csrWith(
        [{name: 'countryName', value: 'LR'}, {name: 'commonName', value: 'ecw.dfsp-a.example'}],
        options);
}

function issuerWith(ca: FakeCa, repository: FakeCertRepository): DfspCertificateIssuer {
    return new DfspCertificateIssuer(ca as any, repository as any, ISSUER_SETTINGS);
}

describe('DfspCertificateIssuer', () => {

    it('should keep the subject the DFSP requested', async () => {
        const repository = new FakeCertRepository();

        const issued = await issuerWith(new FakeCa(), repository).issue({
            fspId: 'dfsp-a',
            csrPem: hostnameCsr(),
        });

        assert.equal(issued.subject, 'C=LR, CN=ecw.dfsp-a.example');
        // The tenant comes from the enrolment, not from the subject: this is what the runtime
        // guard compares with FSPIOP-Source.
        assert.equal(issued.fspId, 'dfsp-a');
    });

    it('should sign verbatim for client authentication only', async () => {
        const ca = new FakeCa();

        await issuerWith(ca, new FakeCertRepository()).issue({fspId: 'dfsp-a', csrPem: hostnameCsr()});

        // Vault takes no usage from the role on this path, so it must be sent on every call.
        assert.equal(ca.requests[0].mount, 'pki_dfsp');
        assert.equal(ca.requests[0].role, 'dfsp-client');
        assert.deepEqual(ca.requests[0].extKeyUsage, ['ClientAuth']);
        assert.deepEqual(ca.requests[0].keyUsage, ['DigitalSignature', 'KeyEncipherment']);
        assert.ok(ca.requests[0].csrPem.includes('CERTIFICATE REQUEST'));
    });

    it('should record the fingerprint a TLS peer would present', async () => {
        const issued = await issuerWith(new FakeCa(), new FakeCertRepository()).issue({
            fspId: 'dfsp-a',
            csrPem: hostnameCsr(),
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
        const repository = new FakeCertRepository();

        const issued = await issuerWith(new FakeCa(), repository).issue({
            fspId: 'dfsp-a',
            csrPem: hostnameCsr(),
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

        await issuerWith(new FakeCa(), repository).issue({fspId: 'dfsp-a', csrPem: hostnameCsr()});

        // Retiring rather than revoking is what lets a DFSP install the new certificate on its own
        // schedule: the old one keeps working until it expires.
        assert.equal(previous.status, ParticipantCertStatusCode.RETIRING);
        assert.ok(repository.saved.includes(previous));
    });

    it('should accept the subject key identifier keytool adds to every request', async () => {
        const issued = await issuerWith(new FakeCa(), new FakeCertRepository()).issue({
            fspId: 'dfsp-a',
            // node-forge only derives this value for certificates, so the encoded value is given.
            csrPem: hostnameCsr({extensions: [{
                name: 'subjectKeyIdentifier',
                value: forge.asn1.create(
                    forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OCTETSTRING, false,
                    forge.util.hexToBytes('0123456789abcdef0123456789abcdef01234567')),
            }]}),
        });

        assert.equal(issued.status, ParticipantCertStatusCode.ACTIVE);
    });

    for (const [label, extension] of [
        ['subject alternative names', {name: 'subjectAltName', altNames: [{type: 2, value: 'dfsp-b'}]}],
        ['server authentication', {name: 'extKeyUsage', serverAuth: true}],
        ['certificate authority status', {name: 'basicConstraints', cA: true}],
        ['key usages', {name: 'keyUsage', keyCertSign: true}],
    ] as const) {
        it(`should refuse a request asking for ${label}`, async () => {
            const ca = new FakeCa();

            // Vault copies requested extensions into a verbatim signature, so the request must be
            // stopped before it reaches the CA rather than checked afterwards.
            await assert.rejects(
                issuerWith(ca, new FakeCertRepository()).issue({
                    fspId: 'dfsp-a',
                    csrPem: hostnameCsr({extensions: [extension]}),
                }),
                /asks for extensions this CA does not grant/);

            assert.equal(ca.requests.length, 0);
        });
    }

    it('should refuse a request that names nothing', async () => {
        const ca = new FakeCa();

        await assert.rejects(
            issuerWith(ca, new FakeCertRepository()).issue({
                fspId: 'dfsp-a',
                csrPem: csrWith([{name: 'countryName', value: 'LR'}]),
            }),
            /no common name/);

        assert.equal(ca.requests.length, 0);
    });

    for (const [label, ca, reason] of [
        ['usable for more than client authentication', new ServerUsageCa(), /rather than client authentication only/],
        ['for a different key', new SwappedKeyCa(), /does not carry the key from the request/],
        ['as a certificate authority', new AuthorityCa(), /is a certificate authority/],
    ] as const) {
        it(`should not record a certificate issued ${label}`, async () => {
            const repository = new FakeCertRepository();

            await assert.rejects(
                issuerWith(ca, repository).issue({fspId: 'dfsp-a', csrPem: hostnameCsr()}),
                reason);

            assert.equal(repository.saved.length, 0, 'an unrecorded certificate cannot be presented');
        });
    }

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
                csrPem: hostnameCsr({bits: 1024}),
            }),
            /too small/);

        assert.equal(ca.requests.length, 0);
    });

    it('should not leak Vault detail when signing fails', async () => {
        const failing = {
            requests: [],
            signCertificateVerbatim: () => Promise.reject(
                new Error('permission denied on pki_dfsp/sign-verbatim/dfsp-client for role foo')),
        };

        await assert.rejects(
            new DfspCertificateIssuer(failing as any, new FakeCertRepository() as any, ISSUER_SETTINGS)
                .issue({fspId: 'dfsp-a', csrPem: hostnameCsr()}),
            (error: Error) => {
                assert.ok(!error.message.includes('pki_dfsp'), 'must not name the Vault path');
                assert.ok(!error.message.includes('permission denied'));
                assert.match(error.message, /could not be issued/);
                return true;
            });
    });
});
