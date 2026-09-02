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
 * is why Vault is called on `sign` and never `issue` — `issue` would have Vault generate the
 * keypair and hand back the private key, which is the opposite guarantee.
 *
 * **The subject is decided here, not by the submitter.** The common name is forced to the `fspId`
 * the operator enrolled, and everything else in the request's subject is discarded, so no
 * certificate can exist whose subject contradicts the tenant it belongs to. That matters because
 * the runtime binding rule compares the certificate against `FSPIOP-Source`: a certificate free to
 * name itself would let a tenant claim another's identity at the point the check is meant to catch.
 */
@Injectable()
export class DfspCertificateIssuer {

    /**
     * Below this a certificate is not worth issuing. Matches the issuing role's own `key_bits`, so
     * a smaller key is refused here with an explanation rather than by Vault with a generic error.
     */
    private static readonly MINIMUM_RSA_KEY_BITS = 2048;

    private readonly logger = new Logger(DfspCertificateIssuer.name);

    constructor(
        private readonly vault: VaultClient,
        private readonly certificates: ParticipantCertRepository,
        private readonly settings: DfspCertificateIssuer.Settings,
    ) {
    }

    async issue(request: DfspCertificateIssuer.Request): Promise<ParticipantCert> {

        DfspCertificateIssuer.assertUsableCsr(request.csrPem);

        const signed = await this.sign(request);
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
            return await this.vault.signCertificate({
                mount: this.settings.mount,
                role: this.settings.role,
                csrPem: request.csrPem,
                commonName: request.fspId,
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
     * Checks the request is a PKCS#10 this CA will sign, before Vault is troubled with it.
     *
     * Only two things are checked: that it parses, and that the key is large enough. Vault enforces
     * the rest, and duplicating its policy here would create two definitions to keep in step.
     */
    private static assertUsableCsr(csrPem: string): void {

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

        return {
            fingerprintSha256: createHash('sha256')
                .update(Buffer.from(der, 'binary'))
                .digest('hex'),
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
        serial: string;
        subject: string;
        validFrom: Date;
        validTo: Date;
    }
}
