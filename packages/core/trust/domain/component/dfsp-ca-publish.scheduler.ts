// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Logger, OnModuleDestroy, OnModuleInit} from '@nestjs/common';
import {RollupLock} from '@core/audit/domain/component';
import {VaultClient} from '@shared/vault';
import {KubernetesSecretWriter} from './kubernetes-secret-writer';

/**
 * Publishes the DFSP-facing certificate authority to the ingress gateway, so the gateway can
 * verify the client certificates Pivotal issues.
 *
 * The gateway is the only thing that sees a DFSP's certificate — it terminates mutual TLS and
 * forwards a description of what it verified. It can only do that against a trust anchor, and
 * Istio reads a gateway's credentials **from the namespace the gateway runs in**, not from the
 * workload's. So this writes across a namespace boundary, which Istio scopes deliberately:
 * whoever can write that Secret decides which authority the gateway trusts.
 *
 * **The bundle is the intermediate followed by the root.** The issuing mount's own chain contains
 * only itself, the root living in a separate mount, so a bundle taken from one alone leaves the
 * gateway unable to build a path from a presented leaf to an anchor it trusts.
 *
 * The CA rotates on the order of years, so this is a slow backstop rather than a hot path. It
 * exists so a rotation reaches the gateway without anyone remembering to copy a file — the same
 * argument as reloading a renewed certificate rather than restarting for it.
 */
export class DfspCaPublishScheduler implements OnModuleInit, OnModuleDestroy {

    private static readonly DEFAULT_INTERVAL_MS = 60 * 60 * 1000;
    private static readonly LOCK_TTL_BUFFER_MS = 30_000;

    /** Istio expects the trust anchor under this key. */
    private static readonly BUNDLE_KEY = 'cacert';

    private readonly logger = new Logger(DfspCaPublishScheduler.name);

    private timer: NodeJS.Timeout | undefined;

    constructor(
        private readonly vault: VaultClient,
        private readonly secrets: KubernetesSecretWriter,
        private readonly lock: RollupLock,
        private readonly settings: DfspCaPublishScheduler.Settings,
        private readonly intervalMs: number = DfspCaPublishScheduler.DEFAULT_INTERVAL_MS,
    ) {}

    onModuleInit(): void {

        if (!this.settings.isConfigured()) {
            this.logger.log(
                'No DFSP-facing gateway configured; the DFSP CA will not be published.');
            return;
        }

        this.timer = setInterval(() => void this.tick(), this.intervalMs);
        this.logger.log(
            `DFSP CA publish scheduled every ${Math.round(this.intervalMs / 60_000)}m `
            + `to ${this.settings.gatewayNamespace}/${this.settings.secretName}.`);

        void this.tick();
    }

    onModuleDestroy(): void {
        if (this.timer != null) {
            clearInterval(this.timer);
            this.timer = undefined;
        }
    }

    /** Exposed for tests and for an operator-triggered refresh. */
    async sync(): Promise<boolean> {

        const bundle = await this.readBundle();

        if (bundle == null) {
            // Reachable before the CA ceremony has run. Writing an empty trust anchor would be
            // worse than writing nothing: the gateway would reject every DFSP rather than
            // continue with the anchor it already holds.
            this.logger.warn(
                `Vault returned no certificate for mount '${this.settings.issuingMount}'; `
                + 'leaving the published bundle untouched.');

            return false;
        }

        return this.secrets.putIfChanged(
            this.settings.secretName,
            {[DfspCaPublishScheduler.BUNDLE_KEY]: bundle},
            this.settings.gatewayNamespace,
        );
    }

    /** Intermediate first, then root — the order a verifier walks. */
    private async readBundle(): Promise<string | null> {

        const intermediate = await this.vault.readPkiCaChain(this.settings.issuingMount);

        if (intermediate == null) {
            return null;
        }

        const root = this.settings.rootMount.length === 0
            ? null
            : await this.vault.readPkiCaChain(this.settings.rootMount);

        if (root == null) {
            this.logger.warn(
                `No root certificate read from '${this.settings.rootMount}'. Publishing the `
                + 'intermediate alone, which verifies only if the gateway treats it as the anchor.');

            return `${intermediate}\n`;
        }

        return `${intermediate}\n${root}\n`;
    }

    private async tick(): Promise<void> {

        const acquired = await this.lock.acquire(this.intervalMs + DfspCaPublishScheduler.LOCK_TTL_BUFFER_MS);

        if (!acquired) {
            return;
        }

        try {
            if (await this.sync()) {
                this.logger.warn(
                    `DFSP CA changed and Secret '${this.settings.gatewayNamespace}/`
                    + `${this.settings.secretName}' was rewritten. The gateway picks this up on `
                    + 'its own; certificates issued under the previous authority stop verifying.');
            }
        } catch (error: unknown) {
            // A control-plane failure must not take the process down. The gateway keeps the anchor
            // it already has, and the next tick retries.
            const message = error instanceof Error ? error.message : String(error);

            this.logger.error(`DFSP CA publish failed: ${message}`);
        }
    }
}

export namespace DfspCaPublishScheduler {

    export class Settings {

        constructor(
            /** The mount that signs DFSP certificates. */
            readonly issuingMount: string,
            /** The mount holding the root above it. Empty publishes the intermediate alone. */
            readonly rootMount: string,
            /** Namespace the ingress gateway runs in. */
            readonly gatewayNamespace: string,
            /** Must match the gateway's `credentialName`. */
            readonly secretName: string,
        ) {}

        isConfigured(): boolean {
            return this.issuingMount.length > 0
                && this.gatewayNamespace.length > 0
                && this.secretName.length > 0;
        }
    }
}
