// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {createHash} from 'node:crypto';
import {Injectable, Logger} from '@nestjs/common';
import * as forge from 'node-forge';
import {VaultClient} from '@shared/vault';
import {ParticipantCert} from '../../model';
import {ParticipantCertStatusCode} from '../../model/participant-cert-status.model';
import {ParticipantCertRepository} from '../../repository/participant-cert.repository';
import {ParticipantErrorCode, participantError} from '../../error/participant-errors';

/**
 * Issues a DFSP's client certificate from Pivotal's DFSP-facing CA.
 *
 * **The DFSP's private key never reaches Pivotal.** Only a PKCS#10 request crosses the boundary,
 * carrying the public key and a signature proving the sender holds the matching private one. That
 * is why Vault is called on `sign-verbatim` and never `issue` — `issue` would have Vault generate
 * the keypair and hand back the private key, which is the opposite guarantee.
 *
 * **The subject is the DFSP's own.** DFSPs import the certificate against the request they
 * generated, and some tooling and internal policies refuse a certificate whose subject differs
 * from that request. Keeping the subject costs nothing in identity: the runtime guard never reads
 * it. It resolves the presented certificate by fingerprint to the row written here, and that row's
 * `fspId` — set by the operator who enrolled it — is what is compared with `FSPIOP-Source`.
 *
 * **What the certificate may do is decided here, not by the submitter.** Signing verbatim makes
 * Vault copy whatever extensions the request asks for, so a request asking for any is refused
 * before it is signed, and the issued certificate is checked to be a client-only leaf for the
 * submitted key before it is recorded.
 */
@Injectable()
export class DfspCertificateIssuer {

    /**
     * Below this a certificate is not worth issuing. Matches the issuing role's own `key_bits`, so
     * a smaller key is refused here with an explanation rather than by Vault with a generic error.
     */
    private static readonly MINIMUM_RSA_KEY_BITS = 2048;

    /**
     * The only extension a request may carry. Java's `keytool -certreq` adds a subject key
     * identifier to every request it makes, and the value is derived from the public key, so it
     * grants nothing. Anything else — names, usages, constraints — would be copied into the
     * certificate as asked.
     */
    private static readonly PERMITTED_CSR_EXTENSIONS: ReadonlySet<string> = new Set([
        forge.pki.oids.subjectKeyIdentifier,
    ]);

    private static readonly KEY_USAGE = ['DigitalSignature', 'KeyEncipherment'];

    private static readonly EXT_KEY_USAGE = ['ClientAuth'];

    private readonly logger = new Logger(DfspCertificateIssuer.name);

    constructor(
        private readonly vault: VaultClient,
        private readonly certificates: ParticipantCertRepository,
        private readonly settings: DfspCertificateIssuer.Settings,
    ) {
    }

    async issue(request: DfspCertificateIssuer.Request): Promise<ParticipantCert> {

        const csr = DfspCertificateIssuer.assertUsableCsr(request.csrPem);

        const signed = await this.sign(request);

        // Checked against what came back, not assumed from what was asked for. Usage on this path
        // depends on parameters Vault could ignore and extensions it copies from the request, and
        // a certificate that can do more than authenticate a client is invisible until someone
        // reads its extensions.
        DfspCertificateIssuer.assertIssuedAsRequested(request.fspId, csr, signed.certificatePem);

        const parsed = DfspCertificateIssuer.parse(signed.certificatePem);

        // Supersede rather than replace. The previous certificate stays acceptable until it expires
        // on its own, so a DFSP installs the new one on its own schedule instead of coordinating a
        // cutover with the hub operator.
        await this.retireExisting(request.fspId);

        const certificate = new ParticipantCert();

        certificate.fspId = request.fspId;
        certificate.fingerprintSha256 = parsed.fingerprintSha256;
        certificate.serial = signed.serialNumber.length > 0 ? signed.serialNumber : parsed.serial;
        certificate.subject = parsed.subject;
        certificate.certPem = signed.certificatePem;
        certificate.caChainPem = signed.caChainPem ?? null;
        certificate.status = ParticipantCertStatusCode.ACTIVE;
        certificate.validFrom = parsed.validFrom;
        certificate.validTo = signed.expiration ?? parsed.validTo;
        certificate.issuedAt = new Date();
        certificate.revokedAt = null;
        certificate.note = request.note ?? null;

        const saved = await this.certificates.save(certificate);

        this.logger.log(
            `Issued a DFSP client certificate for '${request.fspId}' `
            + `(serial ${certificate.serial}, expires ${certificate.validTo.toISOString()}).`,
        );

        return saved;
    }

    private async sign(
        request: DfspCertificateIssuer.Request,
    ): Promise<VaultClient.SignedCertificate> {

        try {
            return await this.vault.signCertificateVerbatim({
                mount: this.settings.mount,
                role: this.settings.role,
                csrPem: request.csrPem,
                keyUsage: DfspCertificateIssuer.KEY_USAGE,
                extKeyUsage: DfspCertificateIssuer.EXT_KEY_USAGE,
                ttl: this.settings.ttl,
            });
        } catch (error: unknown) {
            // The cause belongs in the log, not in the response: it carries Vault paths and role
            // names, and the operator reading the screen cannot act on them anyway.
            const message = error instanceof Error ? error.message : String(error);

            this.logger.error(`Vault could not sign the request for '${request.fspId}': ${message}`);

            throw new Error(participantError(ParticipantErrorCode.CERT_ISSUANCE_FAILED).message);
        }
    }

    /** Moves every certificate the tenant can still present to `retiring`. */
    private async retireExisting(fspId: string): Promise<void> {

        const usable = await this.certificates.findUsableByFspId(fspId);

        for (const existing of usable) {
            if (existing.status === ParticipantCertStatusCode.RETIRING) {
                continue;
            }

            existing.status = ParticipantCertStatusCode.RETIRING;
            await this.certificates.save(existing);
        }
    }

    /**
     * Refuses a certificate that is anything other than a client-only leaf for the submitted key.
     *
     * The last line of defence before the row that makes a certificate usable is written. Each
     * check covers a way signing verbatim could hand out more than intended: a different key would
     * not be the DFSP's, a different subject would not be what they asked for, and any other usage,
     * CA status or name would make the certificate good for something besides this connection.
     */
    private static assertIssuedAsRequested(
        fspId: string,
        csr: forge.pki.CertificateSigningRequest,
        certificatePem: string,
    ): void {

        const certificate = forge.pki.certificateFromPem(certificatePem);

        const refuse = (reason: string): never => {
            throw new Error(
                `The certificate authority issued a certificate for '${fspId}' that ${reason}; `
                + 'the certificate has not been recorded.');
        };

        if (forge.pki.publicKeyToPem(certificate.publicKey)
            !== forge.pki.publicKeyToPem(csr.publicKey!)) {
            refuse('does not carry the key from the request');
        }

        const requestedName = csr.subject.getField('CN')?.value as string | undefined;
        const issuedName = certificate.subject.getField('CN')?.value as string | undefined;

        if (issuedName !== requestedName) {
            refuse(`names '${issuedName ?? ''}' instead of '${requestedName ?? ''}'`);
        }

        const usage = certificate.getExtension('extKeyUsage') as Record<string, unknown> | null;
        const purposes = usage == null
            ? []
            : Object.keys(usage).filter(key =>
                !['id', 'name', 'critical', 'value'].includes(key) && usage[key] === true);

        if (purposes.length !== 1 || purposes[0] !== 'clientAuth') {
            refuse(`is usable for [${purposes.join(', ')}] rather than client authentication only`);
        }

        const constraints = certificate.getExtension('basicConstraints') as {cA?: boolean} | null;

        if (constraints?.cA === true) {
            refuse('is a certificate authority');
        }

        if (certificate.getExtension('subjectAltName') != null) {
            refuse('carries subject alternative names');
        }
    }

    /**
     * Checks the request is a PKCS#10 this CA will sign, before Vault is troubled with it.
     *
     * Signing verbatim leaves Vault no policy to apply to the request, so what it would otherwise
     * enforce is checked here: that it parses, that the key is large enough, that it names
     * something, and that it asks for no extension beyond a key identifier.
     */
    private static assertUsableCsr(csrPem: string): forge.pki.CertificateSigningRequest {

        let csr: forge.pki.CertificateSigningRequest;

        try {
            csr = forge.pki.certificationRequestFromPem(csrPem);
        } catch {
            throw new Error(participantError(ParticipantErrorCode.CSR_MALFORMED).message);
        }

        if (csr.publicKey == null) {
            throw new Error(participantError(ParticipantErrorCode.CSR_MALFORMED).message);
        }

        const modulus = (csr.publicKey as forge.pki.rsa.PublicKey).n;

        if (modulus == null) {
            // A non-RSA key. The issuing role is configured for RSA, so this cannot be signed.
            throw new Error(participantError(ParticipantErrorCode.CSR_KEY_TOO_SMALL).message);
        }

        if (modulus.bitLength() < DfspCertificateIssuer.MINIMUM_RSA_KEY_BITS) {
            throw new Error(participantError(ParticipantErrorCode.CSR_KEY_TOO_SMALL).message);
        }

        const commonName = csr.subject.getField('CN')?.value as string | undefined;

        if (commonName == null || commonName.trim().length === 0) {
            throw new Error(participantError(ParticipantErrorCode.CSR_MISSING_COMMON_NAME).message);
        }

        const requested = (csr.getAttribute({name: 'extensionRequest'}) as
            {extensions?: Array<{id: string}>} | null)?.extensions ?? [];

        if (requested.some(extension =>
            !DfspCertificateIssuer.PERMITTED_CSR_EXTENSIONS.has(extension.id))) {
            throw new Error(participantError(ParticipantErrorCode.CSR_EXTENSION_NOT_ALLOWED).message);
        }

        return csr;
    }

    /**
     * Reads back what was actually issued rather than trusting what was asked for.
     *
     * The fingerprint especially: it is the runtime lookup key, so it has to be computed over the
     * certificate's DER exactly as a TLS peer would present it, not derived from any input.
     */
    private static parse(certificatePem: string): DfspCertificateIssuer.ParsedCertificate {

        const certificate = forge.pki.certificateFromPem(certificatePem);
        const der = forge.asn1.toDer(forge.pki.certificateToAsn1(certificate)).getBytes();

        const commonName = certificate.subject.getField('CN')?.value as string | undefined;

        return {
            fingerprintSha256: createHash('sha256')
                .update(Buffer.from(der, 'binary'))
                .digest('hex'),
            commonName: commonName ?? '',
            serial: certificate.serialNumber,
            subject: certificate.subject.attributes
                .map(attribute => `${attribute.shortName ?? attribute.name}=${attribute.value as string}`)
                .join(', '),
            validFrom: certificate.validity.notBefore,
            validTo: certificate.validity.notAfter,
        };
    }
}

export namespace DfspCertificateIssuer {

    export interface Request {
        fspId: string;
        csrPem: string;
        /** Why this enrollment happened, in the operator's words. */
        note?: string;
    }

    export interface Settings {
        mount: string;
        role: string;
        /** Vault's role default applies when omitted. */
        ttl?: string;
    }

    export interface ParsedCertificate {
        fingerprintSha256: string;
        /** The name the authority actually put in the subject. */
        commonName: string;
        serial: string;
        subject: string;
        validFrom: Date;
        validTo: Date;
    }
}
