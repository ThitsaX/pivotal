// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Logger, OnModuleDestroy, OnModuleInit} from '@nestjs/common';
import {RollupLock} from '@core/audit/domain/component';
import {ParticipantKey, ParticipantKeyRole} from '@core/participant/domain/model';
import {ParticipantKeyRepository} from '@core/participant/domain/repository';
import {McmAxios} from '@shared/mcm-client';
import {DbTarget} from '@shared/typeorm';

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
        // From the write side: a rotation is exactly when the replica's copy of this key is most
        // likely to be the old one, and publishing that to MCM is the peer-breaking mistake.
        const key = await this.participantKeys.findByFspId(fspId, DbTarget.Write);

        if (key == null || key.role !== ParticipantKeyRole.Self || key.jwsPublicKey == null) {
            throw new Error(`No self-role public key held for '${fspId}'.`);
        }

        await this.mcm.publishAndVerifyJwsKey(fspId, key.jwsPublicKey);
    }

    /**
     * Publishes a newly provisioned tenant's key, then switches its signing on.
     *
     * The two steps belong together and in this order. A tenant whose signing is enabled before
     * MCM holds its public key produces signatures no peer can verify, and that surfaces as a Hub
     * rejection — a failure that points at the transfer rather than at the provisioning that caused
     * it. Enabling only after MCM confirms means the worst case is a tenant that cannot sign yet,
     * which is visible and harmless.
     *
     * Publishing here is additive, not a rotation: a tenant MCM already knows about is left alone,
     * because replacing a key peers have pulled breaks verification for all of them. That is what
     * makes this safe to call again on redelivery.
     */
    async publishAndEnable(fspId: string): Promise<void> {

        // From the write side: onboarding writes the row and announces it in the same breath, so
        // the replica may not have it yet and a miss here reads as "no such tenant".
        const key = await this.participantKeys.findByFspId(fspId, DbTarget.Write);

        if (key == null || key.role !== ParticipantKeyRole.Self || key.jwsPublicKey == null) {
            throw new Error(`No self-role public key held for '${fspId}'.`);
        }

        const stored = await this.mcm.getJwsKey(fspId).catch(() => null);
        const storedKey = stored?.publicKey;

        if (storedKey != null && storedKey.trim().length > 0) {
            if (!JwsKeyPublishScheduler.samePem(storedKey, key.jwsPublicKey)) {
                // Deliberately not overwritten, and deliberately fatal for this message: peers hold
                // one key each and cannot try both, so resolving this is a human decision about
                // which key is current, not something to settle by whoever wrote last.
                throw new Error(
                    `MCM holds a different signing key for '${fspId}' than Pivotal does. `
                    + 'Resolve this deliberately rather than by republishing.',
                );
            }
        } else {
            await this.mcm.publishAndVerifyJwsKey(fspId, key.jwsPublicKey);
        }

        if (await this.activate(key)) {
            this.logger.log(`'${fspId}' is published to MCM and signing is now enabled.`);
        }
    }

    /**
     * Switches signing on for a tenant MCM is confirmed to hold the key for, and records that it
     * happened. Returns whether anything changed.
     *
     * The record is what separates a tenant that has never been activated from one that was
     * activated and has since been suspended. Both sit at `jws_sign_enabled = 0`, and only the
     * first is ours to act on: re-enabling the second would undo an operator's suspension within
     * the hour and log it as routine.
     *
     * A tenant that is already signing but carries no timestamp — enabled by hand, before this was
     * recorded — is stamped without touching the switch, so that a later suspension of it is
     * respected too.
     */
    private async activate(key: ParticipantKey): Promise<boolean> {

        if (key.jwsSignActivatedAt != null) {
            return false;
        }

        key.jwsSignActivatedAt = new Date();

        const wasOff = !key.jwsSignEnabled;
        key.jwsSignEnabled = true;

        await this.participantKeys.save(key);

        return wasOff;
    }

    /**
     * Brings every tenant to the state provisioning intended: key registered with MCM, and signing
     * on unless someone decided otherwise.
     *
     * Both halves matter. Registering alone is what stranded tenants that missed the announcement —
     * their key reached MCM, so each later pass counted them "already correct" and moved on while
     * they never signed, and nothing in the sweep's output said so.
     *
     * Exposed for tests and for an operator-triggered pass.
     */
    async reconcile(): Promise<JwsKeyPublishScheduler.Result> {
        // From the write side: this pass decides whether to switch signing on, and a suspension
        // issued moments ago must not be read as a tenant that was never activated.
        const tenants = (await this.participantKeys.findAll(DbTarget.Write))
            .filter(key => key.role === ParticipantKeyRole.Self && key.jwsPublicKey != null);

        let published = 0;
        let alreadyCorrect = 0;
        let activated = 0;
        let diverged = 0;
        let failed = 0;

        for (const tenant of tenants) {
            const fspId = tenant.fspId;

            try {
                const stored = await this.mcm.getJwsKey(fspId).catch(() => null);
                const storedKey = stored?.publicKey;

                if (storedKey != null && storedKey.trim().length > 0) {
                    if (!JwsKeyPublishScheduler.samePem(storedKey, tenant.jwsPublicKey!)) {
                        // Deliberately not resolved here. Either a rotation is half-done and
                        // finishing it automatically would cut off peers still holding the
                        // old key, or someone else wrote to this tenant — and both want a
                        // person, not a timer. Signing stays off: which key is current is
                        // precisely what is in doubt.
                        diverged += 1;

                        this.logger.warn(
                            `MCM holds a different signing key for '${fspId}' than Pivotal does. `
                            + 'Not overwriting: peers hold one key each and cannot try both, so replacing '
                            + 'it breaks every peer that has not re-pulled. Resolve this deliberately.',
                        );
                        continue;
                    }

                    alreadyCorrect += 1;
                } else {
                    // MCM has nothing for this tenant, so there is no peer holding an older
                    // key to break. Filling the gap is safe and is what unblocks a peer
                    // turning on verification.
                    await this.mcm.publishAndVerifyJwsKey(fspId, tenant.jwsPublicKey!);
                    published += 1;
                }

                // MCM is now confirmed to hold this tenant's key, whether this pass put it there or
                // found it already registered. Either way the precondition for signing is met, and
                // a tenant still waiting to be switched on is one the announcement never reached.
                if (await this.activate(tenant)) {
                    activated += 1;

                    this.logger.log(
                        `'${fspId}' was published to MCM but never switched on; signing is now `
                        + 'enabled. Its provisioning announcement was missed.',
                    );
                }
            } catch (error: unknown) {
                // One tenant failing must not stop the rest; the next tick retries.
                failed += 1;

                const message = error instanceof Error ? error.message : String(error);
                this.logger.error(`Could not publish the signing key for '${fspId}': ${message}`);
            }
        }

        return {tenants: tenants.length, published, alreadyCorrect, activated, diverged, failed};
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

            if (result.published > 0 || result.activated > 0 || result.diverged > 0 || result.failed > 0) {
                this.logger.log(
                    `JWS key publish: ${result.published} published, ${result.activated} activated, `
                    + `${result.alreadyCorrect} already correct, ${result.diverged} diverged, `
                    + `${result.failed} failed, of ${result.tenants} tenants.`,
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
        /** Tenants whose signing this pass switched on, having found MCM already holding their key. */
        activated: number;
        diverged: number;
        failed: number;
    }
}
