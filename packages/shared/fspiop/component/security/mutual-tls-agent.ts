// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {createHash} from 'node:crypto';
import * as https from 'node:https';
import * as tls from 'node:tls';
import {Logger} from '@nestjs/common';
import {FspiopMtlsCaStore} from './fspiop-mtls-ca-store';
import {FspiopMtlsClientCertStore} from './fspiop-mtls-client-cert-store';

/**
 * An HTTPS agent whose certificate and trust anchor can change while the process runs.
 *
 * Certificates are renewed on a cadence of weeks: a mounted Secret is rewritten and
 * the kubelet syncs the new file in place. Reading the material once at startup means
 * none of that takes effect until a restart, which turns routine renewal into a
 * scheduled outage every couple of months.
 *
 * The reload swaps the agent's secure context rather than replacing the agent. Node
 * reads that option when opening each new connection, so a swap affects new
 * connections only and pooled ones finish on the material they started with. That is
 * exactly the behaviour wanted during an overlap: nothing in flight is interrupted,
 * and both certificates are valid meanwhile.
 *
 * Polling rather than watching the filesystem. A Secret update arrives as an atomic
 * symlink swap that file watches report inconsistently across platforms, and the
 * kubelet's own sync period is around a minute regardless, so a faster poll would buy
 * nothing.
 */
export class MutualTlsAgent {

    private static readonly DEFAULT_RELOAD_INTERVAL_MS = 60_000;

    private readonly logger = new Logger(MutualTlsAgent.name);

    private readonly agent: https.Agent;
    private timer: NodeJS.Timeout | undefined;
    private fingerprint: string;

    private constructor(
        agent: https.Agent,
        fingerprint: string,
        private readonly intervalMs: number,
    ) {
        this.agent = agent;
        this.fingerprint = fingerprint;
    }

    /** Null when no material is configured, in which case the caller uses no agent. */
    static create(options: MutualTlsAgent.Options): MutualTlsAgent | null {
        const material = MutualTlsAgent.read();

        if (material == null) {
            return null;
        }

        const agent = new https.Agent({
            secureContext: tls.createSecureContext(material.context),
            rejectUnauthorized: options.rejectUnauthorized,
            timeout: options.connectionTimeoutMs,
            ...(options.verifyDomain === false ? {checkServerIdentity: () => undefined} : {}),
        });

        return new MutualTlsAgent(
            agent,
            material.fingerprint,
            options.reloadIntervalMs ?? MutualTlsAgent.DEFAULT_RELOAD_INTERVAL_MS,
        );
    }

    httpsAgent(): https.Agent {
        return this.agent;
    }

    start(): void {
        if (this.timer != null) {
            return;
        }

        this.timer = setInterval(() => this.reload(), this.intervalMs);
        this.timer.unref();
    }

    stop(): void {
        if (this.timer != null) {
            clearInterval(this.timer);
            this.timer = undefined;
        }
    }

    /** Exposed for tests. True when the material actually changed. */
    reload(): boolean {
        try {
            const material = MutualTlsAgent.read();

            if (material == null || material.fingerprint === this.fingerprint) {
                return false;
            }

            // Mutating the agent's options rather than the agent itself, so pooled
            // sockets keep the context they were created with and drain naturally.
            (this.agent.options as tls.ConnectionOptions).secureContext =
                tls.createSecureContext(material.context);
            this.fingerprint = material.fingerprint;

            this.logger.log('Reloaded mutual TLS material; new connections will use it.');

            return true;
        } catch (error: unknown) {
            // A half-written file during a Secret update must not take the process
            // down, and the material already loaded is still valid — so keep serving
            // with it and try again on the next tick.
            const message = error instanceof Error ? error.message : String(error);

            this.logger.error(`Could not reload mutual TLS material; keeping the current one: ${message}`);

            return false;
        }
    }

    private static read(): { context: tls.SecureContextOptions; fingerprint: string } | null {
        const ca = FspiopMtlsCaStore.readPem();
        const pair = FspiopMtlsClientCertStore.readPem();

        if (ca == null && pair == null) {
            return null;
        }

        const context: tls.SecureContextOptions = {};

        if (ca != null) {
            context.ca = ca;
        }

        if (pair != null) {
            context.cert = pair.cert;
            context.key = pair.key;
        }

        // Hashing the material rather than the file's timestamp: a Secret update
        // rewrites the file even when the bytes are unchanged, and rebuilding the
        // context for that would discard the connection pool for nothing.
        const fingerprint = createHash('sha256')
            .update(`${ca ?? ''} ${pair?.cert ?? ''} ${pair?.key ?? ''}`)
            .digest('hex');

        return {context, fingerprint};
    }
}

export namespace MutualTlsAgent {

    export interface Options {
        rejectUnauthorized: boolean;
        connectionTimeoutMs?: number;
        verifyDomain?: boolean;
        reloadIntervalMs?: number;
    }
}
