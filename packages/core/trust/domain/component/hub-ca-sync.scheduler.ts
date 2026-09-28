// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Logger, OnModuleDestroy, OnModuleInit} from '@nestjs/common';
import {RollupLock} from '@core/audit/domain/component';
import {McmAxios} from '@shared/mcm-client';
import {KubernetesSecretWriter} from './kubernetes-secret-writer';

/**
 * Pulls the Hub's CA from the Connection Manager and publishes it as the trust
 * bundle the data plane validates the Hub against.
 *
 * The Secret is the authoritative store for this value, not a copy of one. The
 * bundle is read by web-outbound, the inbound Gateway and every connector, and the
 * connectors have no database access by design — so the registry cannot be where it
 * lives. A Secret is also the only form the Gateway can consume, since Envoy reads
 * Secrets rather than a secret store.
 *
 * A CA certificate is public: this is storage, not custody. What it needs is
 * write-integrity, because whoever can write this bundle can insert their own CA and
 * be trusted as the Hub.
 *
 * The Hub CA rotates rarely — years, not months — so this poll is a slow backstop
 * rather than a hot path. It writes only when the certificate has actually changed.
 */
export class HubCaSyncScheduler implements OnModuleInit, OnModuleDestroy {

    private static readonly DEFAULT_INTERVAL_MS = 60 * 60 * 1000;
    private static readonly LOCK_TTL_BUFFER_MS = 30_000;
    private static readonly BUNDLE_KEY = 'hub-ca.pem';

    private readonly logger = new Logger(HubCaSyncScheduler.name);

    private timer: NodeJS.Timeout | undefined;
    private running = false;

    constructor(
        private readonly mcm: McmAxios,
        private readonly secrets: KubernetesSecretWriter,
        private readonly lock: RollupLock,
        private readonly secretName: string,
        private readonly intervalMs: number = HubCaSyncScheduler.DEFAULT_INTERVAL_MS,
    ) {}

    onModuleInit(): void {
        this.timer = setInterval(() => void this.tick(), this.intervalMs);
        this.logger.log(`Hub CA sync scheduled every ${Math.round(this.intervalMs / 60_000)}m.`);

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
        const hubCa = await this.mcm.getHubCa();
        const pem = hubCa.rootCertificate;

        if (pem == null || !pem.includes('BEGIN CERTIFICATE')) {
            throw new Error('MCM returned no usable Hub CA certificate.');
        }

        const bundle = pem.endsWith('\n') ? pem : `${pem}\n`;

        return this.secrets.putIfChanged(this.secretName, {[HubCaSyncScheduler.BUNDLE_KEY]: bundle});
    }

    private async tick(): Promise<void> {
        if (this.running) {
            return;
        }

        this.running = true;

        const token = await this.lock.acquire(this.intervalMs + HubCaSyncScheduler.LOCK_TTL_BUFFER_MS);

        if (token == null) {
            this.running = false;
            return;
        }

        try {
            if (await this.sync()) {
                // A trust anchor changing is worth an operator's attention on its own,
                // whether or not consumers pick it up unaided. The Node services reload
                // the bundle within a minute; the Java connectors still need a restart.
                this.logger.warn(
                    `Hub CA changed and Secret '${this.secretName}' was rewritten. `
                    + 'Services that do not reload the bundle need a restart to pick it up.',
                );
            }
        } catch (error: unknown) {
            // A control-plane outage must not take the process down. The data plane
            // keeps using the bundle it already has, and the next tick retries.
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error(`Hub CA sync failed; retrying next tick: ${message}`);
        } finally {
            await this.lock.release(token);
            this.running = false;
        }
    }
}
