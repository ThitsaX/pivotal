// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Logger, OnModuleDestroy, OnModuleInit} from '@nestjs/common';
import * as forge from 'node-forge';
import {RollupLock} from '@core/audit/domain/component';
import {McmAxios, OutboundEnrollment, OutboundEnrollmentState} from '@shared/mcm-client';
import {VaultClient} from '@shared/vault';

/**
 * Keeps the **Hub's** client certificate for calling Pivotal back from expiring.
 *
 * The Hub presents this certificate when its egress gateway calls web-inbound, and web-inbound's
 * gateway admits it because Pivotal's CA signed it. MCM holds the Hub's private key and generates
 * the CSR; Pivotal's part is to sign it and hand it back. MCM never asks for that -- it does not
 * renew, and it calls no one -- so without this the callback leg stops on the day the certificate
 * expires.
 *
 * One certificate, for the DFSP Pivotal is registered as. Every tenant's callbacks reach the same
 * web-inbound, so the Hub needs one identity for it, not one per tenant.
 *
 * Renewal is by overlap: the new certificate is signed and published while the old one is still
 * valid, and onboarding moves the Hub to the newest. Nothing at web-inbound changes, because its
 * gateway trusts Pivotal's CA rather than any one certificate.
 */
export class HubCallbackCertEnroller implements OnModuleInit, OnModuleDestroy {

    private static readonly LOCK_TTL_BUFFER_MS = 60_000;
    private static readonly ONBOARD_ATTEMPTS = 3;
    private static readonly ONBOARD_RETRY_DELAY_MS = 5_000;

    private readonly logger = new Logger(HubCallbackCertEnroller.name);

    private timer: NodeJS.Timeout | undefined;
    private running = false;

    /**
     * Set when a certificate was uploaded but publishing it failed. MCM reports no onboarding
     * state, and the uploaded certificate is valid, so without this the next tick would see
     * nothing to do and the Hub would keep presenting the old one until it expired.
     */
    private onboardPending = false;

    constructor(
        private readonly mcm: McmAxios,
        private readonly vault: Pick<VaultClient, 'signCertificate'>,
        private readonly lock: RollupLock,
        private readonly settings: HubCallbackCertEnroller.Settings,
        private readonly now: () => Date = () => new Date(),
        private readonly sleep: (ms: number) => Promise<void> =
            ms => new Promise(resolve => setTimeout(resolve, ms)),
    ) {}

    onModuleInit(): void {
        this.timer = setInterval(() => void this.tick(), this.settings.intervalMs);
        const hours = Math.round(this.settings.intervalMs / 3_600_000);

        this.logger.log(
            `Hub callback certificate for '${this.settings.commonName}' checked every ${hours}h, `
            + `renewed ${this.settings.renewBeforeDays} days before expiry.`,
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
     * Renews only when the Hub has no signed certificate or the newest is inside its renewal
     * window. Returns what it did.
     */
    async renewIfNeeded(): Promise<HubCallbackCertEnroller.Outcome> {
        const enrollments = await this.mcm.listOutboundEnrollments(this.settings.dfspId);
        const current = HubCallbackCertEnroller.newest(enrollments, OutboundEnrollmentState.CertSigned);
        const daysLeft = this.daysUntilExpiry(current?.certificate);

        if (daysLeft != null && daysLeft > this.settings.renewBeforeDays && !this.onboardPending) {
            return 'current';
        }

        // Onboarding hands the Hub whatever CA MCM holds for this DFSP, as the anchor it verifies
        // web-inbound against. Published without one, the Hub could not verify web-inbound, and
        // nothing would onboard again until the next renewal. The CA is registered on its own
        // schedule, so a fresh deployment waits here for it rather than racing it.
        if (!await this.caRegistered()) {
            this.logger.warn(
                `Waiting for Pivotal's CA to be registered under '${this.settings.dfspId}' before `
                + 'signing or publishing the Hub\'s callback certificate.',
            );
            return 'waiting-for-ca';
        }

        if (daysLeft != null && daysLeft > this.settings.renewBeforeDays) {
            await this.onboard();
            return 'published';
        }

        this.logger.log(
            daysLeft == null
                ? `The Hub has no signed callback certificate for '${this.settings.dfspId}'; signing one.`
                : `The Hub's callback certificate expires in ${daysLeft} days; renewing.`,
        );

        const pending = await this.pendingCsr(enrollments, current);
        const signed = await this.vault.signCertificate({
            mount: this.settings.pkiMount,
            role: this.settings.pkiRole,
            csrPem: pending.csr!,
            commonName: this.settings.commonName,
        });

        const uploaded = await this.mcm.uploadOutboundCertificate(
            this.settings.dfspId, pending.id, signed.certificatePem);

        if (uploaded.state !== OutboundEnrollmentState.CertSigned) {
            throw new Error(
                `MCM did not accept the certificate for enrollment ${pending.id} (state ${uploaded.state}).`);
        }

        this.onboardPending = true;
        await this.onboard();

        this.logger.log(
            `Signed and published the Hub's callback certificate for '${this.settings.commonName}' `
            + `(enrollment ${pending.id}).`,
        );

        return 'renewed';
    }

    /**
     * A CSR MCM generated after the current certificate and that was never signed -- left by an
     * earlier attempt that failed part-way -- or a fresh one. Reusing it keeps a run of failures
     * from leaving a CSR behind each day.
     */
    private async pendingCsr(
        enrollments: OutboundEnrollment[],
        current: OutboundEnrollment | undefined,
    ): Promise<OutboundEnrollment> {
        const waiting = HubCallbackCertEnroller.newest(
            enrollments.filter(enrollment => current == null || enrollment.id > current.id),
            OutboundEnrollmentState.CsrLoaded);

        if (waiting?.csr != null && waiting.csr.length > 0) {
            return waiting;
        }

        const created = await this.mcm.createOutboundCsr(this.settings.dfspId);

        if (created.csr == null || created.csr.length === 0) {
            throw new Error(`MCM returned no CSR for '${this.settings.dfspId}'.`);
        }

        return created;
    }

    /**
     * Retried within the tick, because a failure here leaves a valid certificate the Hub is not
     * yet using. Still failing, it stays pending for the next tick.
     */
    private async onboard(): Promise<void> {
        for (let attempt = 1; ; attempt += 1) {
            try {
                await this.mcm.onboard(this.settings.dfspId);
                this.onboardPending = false;
                return;
            } catch (error: unknown) {
                if (attempt >= HubCallbackCertEnroller.ONBOARD_ATTEMPTS) {
                    const message = error instanceof Error ? error.message : String(error);
                    throw new Error(
                        `The certificate is uploaded but onboarding '${this.settings.dfspId}' failed, `
                        + `so the Hub still presents the previous one. Retrying next tick; `
                        + `POST /dfsps/${this.settings.dfspId}/onboard publishes it by hand. ${message}`);
                }

                await this.sleep(HubCallbackCertEnroller.ONBOARD_RETRY_DELAY_MS);
            }
        }
    }

    private async caRegistered(): Promise<boolean> {
        const ca = await this.mcm.getDfspCa(this.settings.dfspId).catch(() => null);

        return ca?.rootCertificate?.includes('BEGIN CERTIFICATE') === true;
    }

    /** Null when there is no certificate, or it cannot be parsed. */
    private daysUntilExpiry(certificatePem: string | undefined): number | null {
        if (certificatePem == null || !certificatePem.includes('BEGIN CERTIFICATE')) {
            return null;
        }

        try {
            const notAfter = forge.pki.certificateFromPem(certificatePem).validity.notAfter.getTime();

            return Math.floor((notAfter - this.now().getTime()) / 86_400_000);
        } catch {
            return null;
        }
    }

    private static newest(
        enrollments: OutboundEnrollment[],
        state: OutboundEnrollmentState,
    ): OutboundEnrollment | undefined {
        return enrollments
            .filter(enrollment => enrollment.state === state)
            .sort((left, right) => right.id - left.id)[0];
    }

    private async tick(): Promise<void> {
        if (this.running) {
            return;
        }

        this.running = true;

        const token = await this.lock.acquire(this.settings.intervalMs + HubCallbackCertEnroller.LOCK_TTL_BUFFER_MS);

        if (token == null) {
            this.running = false;
            return;
        }

        try {
            await this.renewIfNeeded();
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error(`Hub callback certificate renewal failed; retrying next tick: ${message}`);
        } finally {
            await this.lock.release(token);
            this.running = false;
        }
    }
}

export namespace HubCallbackCertEnroller {

    export type Outcome = 'current' | 'renewed' | 'published' | 'waiting-for-ca';

    export interface Settings {
        /** The DFSP Pivotal is registered as in MCM. */
        dfspId: string;
        /**
         * web-inbound's public host. MCM uses the certificate's common name as the address the Hub
         * calls back on, so this must be the name the Hub's egress resolves.
         */
        commonName: string;
        /** Pivotal's Hub-facing CA mount, and the client-only role that signs for this one name. */
        pkiMount: string;
        pkiRole: string;
        /**
         * Must stay well inside the certificate's lifetime, which the Vault role sets (a year).
         * Fixed rather than configured for that reason: set at or above the lifetime it would
         * renew on every tick.
         */
        renewBeforeDays: number;
        intervalMs: number;
    }
}
