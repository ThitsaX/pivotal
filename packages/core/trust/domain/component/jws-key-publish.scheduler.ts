// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Logger, OnModuleDestroy, OnModuleInit} from '@nestjs/common';
import {RollupLock} from '@core/audit/domain/component';
import {ParticipantKeyRole} from '@core/participant/domain/model';
import {ParticipantKeyRepository} from '@core/participant/domain/repository';
import {McmAxios} from '@shared/mcm-client';

/**
 * Publishes the public half of each Pivotal-fronted tenant's FSPIOP signing key to
 * the Connection Manager.
 *
 * The mirror image of the peer sync. We pull peers' keys so inbound traffic can be
 * verified; peers run the same pull against MCM, so unless our keys are registered
 * there, every peer that turns on verification rejects everything Pivotal signs.
 *
 * Only the public half leaves. The private half stays where the signer reads it.
 * This is also not the DFSP's accessKey — that one the DFSP generates, and it never
 * goes near MCM.
 *
 * **This job never overwrites a key MCM already holds.** The FSPIOP protected header
 * carries no key identifier and MCM stores exactly one key per tenant, so a verifying
 * peer holds one key and cannot try both: replacing it breaks every peer that has not
 * yet re-pulled. Rotation is therefore a deliberate, ordered act — generate, record
 * locally, publish, let peers propagate, and only then switch the signing key.
 * Reversing the last two steps is an outage for that FSP.
 *
 * So the automatic behaviour is deliberately narrow: fill a gap, and report a
 * disagreement rather than resolving it. {@link publish} is the operator-driven path
 * that does replace, for use once the rest of a rotation is sequenced correctly.
 */
export class JwsKeyPublishScheduler implements OnModuleInit, OnModuleDestroy {

    private static readonly DEFAULT_INTERVAL_MS = 60 * 60 * 1000;
    private static readonly LOCK_TTL_BUFFER_MS = 30_000;

    private readonly logger = new Logger(JwsKeyPublishScheduler.name);

    private timer: NodeJS.Timeout | undefined;
    private running = false;

    constructor(
        private readonly mcm: McmAxios,
        private readonly participantKeys: ParticipantKeyRepository,
        private readonly lock: RollupLock,
        private readonly intervalMs: number = JwsKeyPublishScheduler.DEFAULT_INTERVAL_MS,
    ) {}

    onModuleInit(): void {
        this.timer = setInterval(() => void this.tick(), this.intervalMs);
        this.logger.log(`JWS key publish scheduled every ${Math.round(this.intervalMs / 60_000)}m.`);

        void this.tick();
    }

    onModuleDestroy(): void {
        if (this.timer != null) {
            clearInterval(this.timer);
            this.timer = undefined;
        }
    }

    /**
     * Publishes one tenant's key and requires MCM to store it byte-for-byte,
     * **replacing whatever is there**. The operator-driven rotation path: only call
     * it when peers are ready to be told about a new key.
     */
    async publish(fspId: string): Promise<void> {
        const key = await this.participantKeys.findByFspId(fspId);

        if (key == null || key.role !== ParticipantKeyRole.Self || key.jwsPublicKey == null) {
            throw new Error(`No self-role public key held for '${fspId}'.`);
        }

        await this.mcm.publishAndVerifyJwsKey(fspId, key.jwsPublicKey);
    }

    /** Exposed for tests and for an operator-triggered pass. */
    async reconcile(): Promise<JwsKeyPublishScheduler.Result> {
        const tenants = (await this.participantKeys.findAll())
            .filter(key => key.role === ParticipantKeyRole.Self && key.jwsPublicKey != null);

        let published = 0;
        let alreadyCorrect = 0;
        let diverged = 0;
        let failed = 0;

        for (const tenant of tenants) {
            const fspId = tenant.fspId;

            try {
                const stored = await this.mcm.getJwsKey(fspId).catch(() => null);
                const storedKey = stored?.publicKey;

                if (storedKey != null && storedKey.trim().length > 0) {
                    if (JwsKeyPublishScheduler.samePem(storedKey, tenant.jwsPublicKey!)) {
                        alreadyCorrect += 1;
                        continue;
                    }

                    // Deliberately not resolved here. Either a rotation is half-done and
                    // finishing it automatically would cut off peers still holding the
                    // old key, or someone else wrote to this tenant — and both want a
                    // person, not a timer.
                    diverged += 1;

                    this.logger.warn(
                        `MCM holds a different signing key for '${fspId}' than Pivotal does. `
                        + 'Not overwriting: peers hold one key each and cannot try both, so replacing '
                        + 'it breaks every peer that has not re-pulled. Resolve this deliberately.',
                    );
                    continue;
                }

                // MCM has nothing for this tenant, so there is no peer holding an older
                // key to break. Filling the gap is safe and is what unblocks a peer
                // turning on verification.
                await this.mcm.publishAndVerifyJwsKey(fspId, tenant.jwsPublicKey!);
                published += 1;
            } catch (error: unknown) {
                // One tenant failing must not stop the rest; the next tick retries.
                failed += 1;

                const message = error instanceof Error ? error.message : String(error);
                this.logger.error(`Could not publish the signing key for '${fspId}': ${message}`);
            }
        }

        return {tenants: tenants.length, published, alreadyCorrect, diverged, failed};
    }

    /** PEMs differ harmlessly in trailing whitespace; compare the content. */
    private static samePem(left: string, right: string): boolean {
        return left.replace(/\s+/g, '') === right.replace(/\s+/g, '');
    }

    private async tick(): Promise<void> {
        if (this.running) {
            return;
        }

        this.running = true;

        const token = await this.lock.acquire(this.intervalMs + JwsKeyPublishScheduler.LOCK_TTL_BUFFER_MS);

        if (token == null) {
            this.running = false;
            return;
        }

        try {
            const result = await this.reconcile();

            if (result.published > 0 || result.diverged > 0 || result.failed > 0) {
                this.logger.log(
                    `JWS key publish: ${result.published} published, ${result.alreadyCorrect} already `
                    + `correct, ${result.diverged} diverged, ${result.failed} failed, `
                    + `of ${result.tenants} tenants.`,
                );
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error(`JWS key publish failed; retrying next tick: ${message}`);
        } finally {
            await this.lock.release(token);
            this.running = false;
        }
    }
}

export namespace JwsKeyPublishScheduler {

    export interface Result {
        tenants: number;
        published: number;
        alreadyCorrect: number;
        diverged: number;
        failed: number;
    }
}
