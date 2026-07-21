// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Logger, OnModuleDestroy, OnModuleInit} from '@nestjs/common';
import {EnforceOutcome, enforceStreamLimits, NatsClientService, StreamLimits} from '@shared/nats';

/**
 * Periodically enforces retention limits on the JetStream streams this deployment shares with the
 * Java connectors — most importantly `PIVOTAL_FSPIOP` (`fspiop.>`), which the connectors create and
 * own but which Pivotal neither produces to nor consumes. JetStream stream management is
 * account-scoped, so `app-auditor` (already on the shared NATS account) can bound and reclaim that
 * stream without any change to the connector code we don't own.
 *
 * Why a periodic sweep rather than a one-shot on startup: the connectors create (and can recreate)
 * their stream on their own schedule — possibly after this pod booted — and new connectors can
 * appear at any time. A recurring pass converges the limits whenever the stream happens to exist,
 * independent of boot order (a stream that isn't there yet is skipped and retried next tick).
 *
 * Multi-replica safety: every `app-auditor` replica runs this timer, but `streams.update` is
 * idempotent and only fires on drift (each tick first inspects and no-ops when already in sync), so
 * no distributed lock is needed — concurrent identical updates converge to the same config.
 *
 * Runs in-process on `setInterval`, matching the codebase's periodic-refresh convention
 * (e.g. {@link TransactionRollupScheduler}); `@nestjs/schedule` is not a dependency.
 */
export class StreamLimitsEnforcer implements OnModuleInit, OnModuleDestroy {

    private readonly logger = new Logger(StreamLimitsEnforcer.name);
    private timer: NodeJS.Timeout | undefined;
    private running = false;

    constructor(
        private readonly nats: NatsClientService,
        private readonly streams: ReadonlyArray<StreamLimits>,
        private readonly intervalMs: number,
    ) {}

    onModuleInit(): void {
        if (this.streams.length === 0) {
            this.logger.log('No streams configured for limit enforcement; enforcer idle.');
            return;
        }

        // Fire once so a freshly (re)started pod bounds/reclaims immediately, then settle into the
        // periodic cadence that catches streams created later by their owner.
        void this.tick();
        this.timer = setInterval(() => void this.tick(), this.intervalMs);
        this.timer.unref?.();

        this.logger.log(
            `Stream-limits enforcer started (every ${this.intervalMs}ms) for `
            + `${this.streams.map((s) => s.name).join(', ')}.`,
        );
    }

    onModuleDestroy(): void {
        if (this.timer !== undefined) {
            clearInterval(this.timer);
            this.timer = undefined;
        }
    }

    /**
     * One enforcement cycle. Fully guarded: a throw here would be an unhandled rejection in the
     * interval callback. Skips if a prior tick on this replica is still running.
     */
    private async tick(): Promise<void> {
        if (this.running) {
            this.logger.debug('Previous enforcement tick still running; skipping.');
            return;
        }
        this.running = true;

        try {
            const jsm = await this.nats.nc.jetstream().jetstreamManager();
            const outcomes: Record<EnforceOutcome, number> = {updated: 0, 'in-sync': 0, absent: 0, failed: 0};

            for (const limits of this.streams) {
                const outcome = await enforceStreamLimits(jsm, limits, this.logger);
                outcomes[outcome]++;
            }

            // Only surface at info level when something actually changed or failed; steady state
            // (all in-sync/absent) stays at debug to avoid log spam every interval.
            const noteworthy = outcomes.updated > 0 || outcomes.failed > 0;
            const summary =
                `Stream-limits sweep: updated=${outcomes.updated} in-sync=${outcomes['in-sync']} `
                + `absent=${outcomes.absent} failed=${outcomes.failed}.`;
            if (noteworthy) {
                this.logger.log(summary);
            } else {
                this.logger.debug(summary);
            }
        } catch (error) {
            this.logger.error(
                `Stream-limits enforcement tick failed: ${error instanceof Error ? error.message : String(error)}`,
                error instanceof Error ? error.stack : undefined,
            );
        } finally {
            this.running = false;
        }
    }
}
