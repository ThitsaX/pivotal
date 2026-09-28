// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Logger, OnModuleDestroy, OnModuleInit} from '@nestjs/common';
import * as forge from 'node-forge';
import {RollupLock} from '@core/audit/domain/component';
import {InboundEnrollmentState, McmAxios} from '@shared/mcm-client';
import {KubernetesSecretWriter} from './kubernetes-secret-writer';

/**
 * Obtains the server certificate the Hub validates when it calls Pivotal, and keeps
 * it from expiring.
 *
 * This certificate is issued by the **Hub's** CA, not Pivotal's — it is the only one
 * in the system that is, which is why it comes through MCM's enrollment flow rather
 * than from Vault. Pivotal proves it holds the matching private key by signing the
 * CSR; the key itself is generated here and never leaves.
 *
 * One certificate for Pivotal, not one per tenant: what identifies a tenant on the
 * hub-facing leg is the message signature, not the connection.
 *
 * Renewal is by overlap, not replacement. A new certificate is obtained before the
 * old one expires and both are valid meanwhile, so nothing has to be coordinated
 * with the Hub.
 */
export class HubServerCertEnroller implements OnModuleInit, OnModuleDestroy {

    /**
     * MCM enforces 4096 on this path. A 2048-bit CSR is still signed, but the
     * enrollment is recorded INVALID on a key-length check, which discards MCM's
     * validation signal for nothing. Unrelated to the RSA-2048 used for message
     * signing — this is a TLS key, and it is generated once a year rather than
     * hundreds of times a second.
     */
    private static readonly KEY_BITS = 4096;

    private static readonly DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000;
    private static readonly DEFAULT_RENEW_BEFORE_DAYS = 30;
    private static readonly LOCK_TTL_BUFFER_MS = 60_000;
    private static readonly CERT_KEY = 'tls.crt';
    private static readonly PRIVATE_KEY = 'tls.key';

    private readonly logger = new Logger(HubServerCertEnroller.name);

    private timer: NodeJS.Timeout | undefined;
    private running = false;

    constructor(
        private readonly mcm: McmAxios,
        private readonly secrets: KubernetesSecretWriter,
        private readonly lock: RollupLock,
        private readonly dfspId: string,
        private readonly commonName: string,
        private readonly secretName: string,
        private readonly intervalMs: number = HubServerCertEnroller.DEFAULT_INTERVAL_MS,
        private readonly renewBeforeDays: number = HubServerCertEnroller.DEFAULT_RENEW_BEFORE_DAYS,
    ) {}

    onModuleInit(): void {
        this.timer = setInterval(() => void this.tick(), this.intervalMs);
        const hours = this.intervalMs / 3_600_000;
        const every = hours >= 1 ? `${Math.round(hours)}h` : `${Math.round(this.intervalMs / 60_000)}m`;

        this.logger.log(
            `Hub server certificate check scheduled every ${every}, `
            + `renewing ${this.renewBeforeDays} days before expiry.`,
        );

        void this.tick();
    }

    onModuleDestroy(): void {
        if (this.timer != null) {
            clearInterval(this.timer);
            this.timer = undefined;
        }
    }

    /**
     * Enrols only when there is no usable certificate, or the one held is inside its
     * renewal window. Returns false when nothing needed doing.
     */
    async enrolIfNeeded(): Promise<boolean> {
        const existing = await this.secrets.read(this.secretName, HubServerCertEnroller.CERT_KEY);
        const daysLeft = HubServerCertEnroller.daysUntilExpiry(existing);

        if (daysLeft != null && daysLeft > this.renewBeforeDays) {
            return false;
        }

        if (daysLeft != null) {
            this.logger.log(`Hub server certificate expires in ${daysLeft} days; renewing.`);
        }

        await this.enrol();

        return true;
    }

    /** The full flow: generate, submit, sign, store. */
    async enrol(): Promise<void> {
        const {privateKeyPem, csrPem} = HubServerCertEnroller.generateCsr(this.commonName);

        const submitted = await this.mcm.createInboundEnrollment(this.dfspId, csrPem);
        const signed = await this.mcm.signInboundEnrollment(this.dfspId, submitted.id);

        if (signed.state !== InboundEnrollmentState.CertSigned || signed.certificate == null) {
            throw new Error(
                `MCM did not sign enrollment ${submitted.id} for '${this.dfspId}' `
                + `(state ${signed.state}).`,
            );
        }

        if (signed.validationState !== 'VALID') {
            // Signed but flagged. Worth surfacing rather than swallowing: the usual
            // cause is a key length MCM does not accept, and the certificate works
            // while the registry records it as suspect.
            this.logger.warn(
                `MCM signed the certificate but recorded it '${signed.validationState}'. `
                + 'The certificate is usable; the registry entry is not clean.',
            );
        }

        // Written together and only now: a certificate without its key is useless,
        // and a key written before its certificate is a window where the Secret
        // holds a pair that does not match.
        await this.secrets.putIfChanged(this.secretName, {
            [HubServerCertEnroller.CERT_KEY]: signed.certificate,
            [HubServerCertEnroller.PRIVATE_KEY]: privateKeyPem,
        });

        this.logger.log(
            `Enrolled a Hub-signed server certificate for '${this.commonName}' `
            + `into Secret '${this.secretName}'.`,
        );
    }

    private static generateCsr(commonName: string): { privateKeyPem: string; csrPem: string } {
        const keys = forge.pki.rsa.generateKeyPair({bits: HubServerCertEnroller.KEY_BITS});
        const csr = forge.pki.createCertificationRequest();

        csr.publicKey = keys.publicKey;
        csr.setSubject([{name: 'commonName', value: commonName}, {name: 'organizationName', value: 'ThitsaWorks'}]);
        csr.sign(keys.privateKey, forge.md.sha256.create());

        return {
            privateKeyPem: forge.pki.privateKeyToPem(keys.privateKey),
            csrPem: forge.pki.certificationRequestToPem(csr),
        };
    }

    /** Null when there is no certificate, or it cannot be parsed. */
    private static daysUntilExpiry(certificatePem: string | null): number | null {
        if (certificatePem == null || !certificatePem.includes('BEGIN CERTIFICATE')) {
            return null;
        }

        try {
            const notAfter = forge.pki.certificateFromPem(certificatePem).validity.notAfter.getTime();

            return Math.floor((notAfter - Date.now()) / 86_400_000);
        } catch {
            return null;
        }
    }

    private async tick(): Promise<void> {
        if (this.running) {
            return;
        }

        this.running = true;

        const token = await this.lock.acquire(this.intervalMs + HubServerCertEnroller.LOCK_TTL_BUFFER_MS);

        if (token == null) {
            this.running = false;
            return;
        }

        try {
            await this.enrolIfNeeded();
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error(`Hub server certificate enrollment failed; retrying next tick: ${message}`);
        } finally {
            await this.lock.release(token);
            this.running = false;
        }
    }
}
