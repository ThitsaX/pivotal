// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import * as fs from 'node:fs/promises';
import {Logger, OnModuleDestroy, OnModuleInit} from '@nestjs/common';
import {RollupLock} from '@core/audit/domain/component';
import {ParticipantKeyRole} from '@core/participant/domain/model';
import {ParticipantKeyRepository} from '@core/participant/domain/repository';
import {McmAxios} from '@shared/mcm-client';

/**
 * Keeps Pivotal's Hub-facing CA registered with the Connection Manager, under every
 * tenant Pivotal fronts.
 *
 * It is **one certificate registered N times**, not N certificates. MCM's model
 * assumes one DFSP is one organisation with one CA; Pivotal is one organisation
 * fronting many, and MCM offers no endpoint for that shape. Posting the same root
 * under each tenant works because MCM applies no uniqueness constraint and no
 * cross-DFSP comparison.
 *
 * Registering the CA rather than each leaf is what lets cert-manager rotate every
 * workload's certificate on its own cadence with no MCM interaction at all.
 *
 * Scheduled rather than triggered because registering across N tenants is N calls —
 * too long for a synchronous request, and the shape is declare-intent-and-converge.
 *
 * **Registering is not distributing.** MCM stores what it is told; it does not put
 * the certificate into the Hub's ingress trust store. A Hub operator does that out
 * of band, which is why this job can report everything registered while the Hub
 * still rejects the connection.
 */
export class McmCaRegistrationScheduler implements OnModuleInit, OnModuleDestroy {

    private static readonly DEFAULT_INTERVAL_MS = 60 * 60 * 1000;
    private static readonly LOCK_TTL_BUFFER_MS = 30_000;

    private readonly logger = new Logger(McmCaRegistrationScheduler.name);

    private timer: NodeJS.Timeout | undefined;
    private running = false;

    constructor(
        private readonly mcm: McmAxios,
        private readonly participantKeys: ParticipantKeyRepository,
        private readonly lock: RollupLock,
        /**
         * Where Pivotal's own Hub-facing root certificate is mounted.
         *
         * A file rather than a Vault path, because the root only lives in Vault in a
         * local rehearsal. In a real deployment it is held in a key service with no
         * export API, and what reaches the cluster is the certificate alone — written
         * by the ceremony, not fetched from anywhere at runtime.
         */
        private readonly caPath: string,
        private readonly intervalMs: number = McmCaRegistrationScheduler.DEFAULT_INTERVAL_MS,
    ) {}

    onModuleInit(): void {
        this.timer = setInterval(() => void this.tick(), this.intervalMs);
        this.logger.log(`MCM CA registration reconcile scheduled every ${Math.round(this.intervalMs / 60_000)}m.`);

        void this.tick();
    }

    onModuleDestroy(): void {
        if (this.timer != null) {
            clearInterval(this.timer);
            this.timer = undefined;
        }
    }

    /** Exposed for tests and for an operator-triggered reconcile. */
    async reconcile(): Promise<McmCaRegistrationScheduler.Result> {
        const certificate = await this.readPivotalCa();
        const tenants = (await this.participantKeys.findAll())
            .filter(key => key.role === ParticipantKeyRole.Self)
            .map(key => key.fspId);

        let registered = 0;
        let alreadyCorrect = 0;
        let failed = 0;

        for (const fspId of tenants) {
            try {
                // MCM is authoritative for what MCM holds, so the current state is read
                // from MCM rather than from a local mirror. A mirror would only add a
                // second copy to drift against the thing it is describing.
                const current = await this.mcm.getDfspCa(fspId).catch(() => null);

                if (McmCaRegistrationScheduler.samePem(current?.rootCertificate, certificate)) {
                    alreadyCorrect += 1;
                    continue;
                }

                await this.mcm.registerCa(fspId, {rootCertificate: certificate});
                registered += 1;

                this.logger.log(`Registered the Pivotal CA with MCM for '${fspId}'.`);
            } catch (error: unknown) {
                // One tenant failing must not stop the rest: a partial reconcile that
                // converges the others is better than none, and the next tick retries.
                failed += 1;

                const message = error instanceof Error ? error.message : String(error);
                this.logger.error(`Could not register the Pivotal CA for '${fspId}': ${message}`);
            }
        }

        return {tenants: tenants.length, registered, alreadyCorrect, failed};
    }

    private async readPivotalCa(): Promise<string> {
        const pem = await fs.readFile(this.caPath, 'utf8');

        if (!pem.includes('BEGIN CERTIFICATE')) {
            throw new Error(`No usable certificate at ${this.caPath}.`);
        }

        return pem;
    }

    /** PEMs differ harmlessly in trailing whitespace; compare the content. */
    private static samePem(left: string | undefined, right: string): boolean {
        return left != null && left.replace(/\s+/g, '') === right.replace(/\s+/g, '');
    }

    private async tick(): Promise<void> {
        if (this.running) {
            return;
        }

        this.running = true;

        const token = await this.lock.acquire(this.intervalMs + McmCaRegistrationScheduler.LOCK_TTL_BUFFER_MS);

        if (token == null) {
            this.running = false;
            return;
        }

        try {
            const result = await this.reconcile();

            if (result.registered > 0 || result.failed > 0) {
                this.logger.log(
                    `MCM CA reconcile: ${result.registered} registered, `
                    + `${result.alreadyCorrect} already correct, ${result.failed} failed, `
                    + `of ${result.tenants} tenants.`,
                );
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error(`MCM CA reconcile failed; retrying next tick: ${message}`);
        } finally {
            await this.lock.release(token);
            this.running = false;
        }
    }
}

export namespace McmCaRegistrationScheduler {

    export interface Result {
        tenants: number;
        registered: number;
        alreadyCorrect: number;
        failed: number;
    }
}
