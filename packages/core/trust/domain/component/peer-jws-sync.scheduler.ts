// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Logger, OnModuleDestroy, OnModuleInit} from '@nestjs/common';
// A generic Redis SET-NX lock that happens to be named for its first caller. Reused
// rather than duplicated: its reconnect, bounded-retry and fail-closed behaviour is
// the hard part, and it takes the lock key as a constructor argument.
import {RollupLock} from '@core/audit/domain/component';
import {ParticipantKey, ParticipantKeyRole} from '@core/participant/domain/model';
import {ParticipantKeyRepository} from '@core/participant/domain/repository';
import {McmAxios} from '@shared/mcm-client';

/**
 * Pulls every peer's FSPIOP JWS public key from the Connection Manager and keeps
 * `participant_key` in step with it.
 *
 * This is the first slice of trust-manager, and one of its scheduled operations. It
 * exists because web-inbound cannot verify a peer's signature without that peer's
 * public key, and nothing else fetches them.
 *
 * **One MCM call per tick, not one per tenant.** `GET /dfsps/jwscerts` is an
 * aggregate endpoint outside the `/dfsps/{dfspId}/` path, so a single credential and
 * a single token cover every peer. MCM is control plane: this traffic is independent
 * of TPS.
 *
 * Multi-replica safety follows the rollup convention — every replica's timer fires,
 * a Redis lock decides which one runs, and a failed tick simply waits for the next.
 * Safe because the sync is idempotent: it recomputes the same rows.
 */
export class PeerJwsSyncScheduler implements OnModuleInit, OnModuleDestroy {

    private static readonly DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
    private static readonly LOCK_TTL_BUFFER_MS = 30_000;

    private readonly logger = new Logger(PeerJwsSyncScheduler.name);

    private timer: NodeJS.Timeout | undefined;
    private running = false;

    constructor(
        private readonly mcm: McmAxios,
        private readonly participantKeys: ParticipantKeyRepository,
        private readonly lock: RollupLock,
        private readonly intervalMs: number = PeerJwsSyncScheduler.DEFAULT_INTERVAL_MS,
    ) {}

    onModuleInit(): void {
        this.timer = setInterval(() => void this.tick(), this.intervalMs);
        this.logger.log(`Peer JWS sync scheduled every ${Math.round(this.intervalMs / 1000)}s.`);

        void this.tick();
    }

    onModuleDestroy(): void {
        if (this.timer != null) {
            clearInterval(this.timer);
            this.timer = undefined;
        }
    }

    /** Exposed for tests and for an operator-triggered resync. */
    async sync(): Promise<PeerJwsSyncScheduler.Result> {
        const entries = await this.mcm.listAllJwsKeys();

        let created = 0;
        let updated = 0;
        let skippedSelf = 0;
        let unchanged = 0;

        for (const entry of entries) {
            const fspId = entry.dfspId;

            if (fspId == null || fspId.trim().length === 0 || entry.publicKey == null) {
                continue;
            }

            const existing = await this.participantKeys.findByFspId(fspId);

            // Our own tenants come back in this list too — trust-manager published
            // them. Rewriting one as a peer would strip its `self` role and, with it,
            // web-outbound's ability to find a signing key for that tenant. Leave them
            // entirely alone: MCM is downstream of us for a `self` row, never upstream.
            if (existing != null && existing.role === ParticipantKeyRole.Self) {
                skippedSelf += 1;
                continue;
            }

            if (existing == null) {
                const created$ = new ParticipantKey();
                created$.fspId = fspId;
                created$.role = ParticipantKeyRole.Peer;
                created$.jwsPublicKey = entry.publicKey;
                created$.jwsPrivateKey = null;
                created$.jwsSignEnabled = false;
                created$.jwsVerifyMode = 'off';

                await this.participantKeys.save(created$);
                created += 1;
                continue;
            }

            if (existing.jwsPublicKey === entry.publicKey) {
                unchanged += 1;
                continue;
            }

            // Only the public key moves. `jws_verify_mode` is a local rollout decision
            // per source, and MCM has no opinion about it — overwriting it here would
            // silently undo an operator's cutover.
            existing.jwsPublicKey = entry.publicKey;

            await this.participantKeys.save(existing);
            updated += 1;
        }

        return {total: entries.length, created, updated, unchanged, skippedSelf};
    }

    private async tick(): Promise<void> {
        if (this.running) {
            return;
        }

        this.running = true;

        const token = await this.lock.acquire(this.intervalMs + PeerJwsSyncScheduler.LOCK_TTL_BUFFER_MS);

        if (token == null) {
            this.running = false;
            return;
        }

        try {
            const result = await this.sync();

            if (result.created > 0 || result.updated > 0) {
                this.logger.log(
                    `Peer JWS sync: ${result.created} added, ${result.updated} updated, `
                    + `${result.unchanged} unchanged, ${result.skippedSelf} own tenants skipped.`,
                );
            }
        } catch (error: unknown) {
            // A control-plane outage must not take the process down. The next tick
            // retries, and the data plane keeps verifying with the keys it already has.
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error(`Peer JWS sync failed; retrying next tick: ${message}`);
        } finally {
            await this.lock.release(token);
            this.running = false;
        }
    }
}

export namespace PeerJwsSyncScheduler {

    export interface Result {
        total: number;
        created: number;
        updated: number;
        unchanged: number;
        skippedSelf: number;
    }
}
