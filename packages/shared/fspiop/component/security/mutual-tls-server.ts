// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {createHash} from 'node:crypto';
import * as https from 'node:https';
import * as tls from 'node:tls';
import {Logger} from '@nestjs/common';
import {FspiopMtlsCaStore} from './fspiop-mtls-ca-store';
import {FspiopMtlsServerCertStore} from './fspiop-mtls-server-cert-store';

/**
 * The listener's TLS material, kept current while the process runs.
 *
 * The counterpart to MutualTlsAgent, and for the same reason: the certificate is
 * renewed into a mounted Secret every few weeks, and material read once at startup
 * turns each routine renewal into a scheduled outage. A server swaps its material
 * through setSecureContext, which applies to subsequent handshakes and leaves
 * established connections on the material they negotiated with.
 *
 * Two things are fixed at construction and cannot be swapped: whether a client
 * certificate is requested, and whether an unverifiable one is rejected. Both are
 * policy rather than material, so a change to either is a deployment change.
 */
export class MutualTlsServer {

    private static readonly DEFAULT_RELOAD_INTERVAL_MS = 60_000;

    private readonly logger = new Logger(MutualTlsServer.name);

    private timer: NodeJS.Timeout | undefined;
    private watched: https.Server | undefined;
    private fingerprint: string;

    private constructor(
        private readonly material: MutualTlsServer.Material,
        fingerprint: string,
        private readonly options: MutualTlsServer.Options,
    ) {
        this.fingerprint = fingerprint;
    }

    /**
     * Throws when the material is missing. Unlike the client side, a server has no
     * degraded mode to fall back to: without a certificate it cannot complete a
     * handshake at all, so refusing to start says plainly what a stream of failed
     * connections would only imply.
     */
    static create(options: MutualTlsServer.Options): MutualTlsServer {
        const material = MutualTlsServer.read();

        if (material.cert == null) {
            throw new Error(
                'Mutual TLS is enabled but no server certificate is configured. '
                + 'Set FSPIOP_MTLS_SERVER_CERT_PATH and FSPIOP_MTLS_SERVER_KEY_PATH.');
        }

        if (options.requestClientCert && material.ca == null) {
            throw new Error(
                'Mutual TLS is enabled but no certificate authority is configured, so a '
                + 'client certificate could not be verified. Set FSPIOP_MTLS_CA_PATH.');
        }

        return new MutualTlsServer(material, MutualTlsServer.fingerprint(material), options);
    }

    /** The options the listener is created with. */
    httpsOptions(): https.ServerOptions {
        return {
            cert: this.material.cert,
            key: this.material.key,
            ...(this.material.ca == null ? {} : {ca: this.material.ca}),
            requestCert: this.options.requestClientCert,
            rejectUnauthorized: this.options.requestClientCert,
        };
    }

    /** Begins reloading into the running listener. */
    watch(server: https.Server): void {
        if (this.timer != null) {
            return;
        }

        this.watched = server;
        this.timer = setInterval(() => this.reload(), this.reloadIntervalMs());
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
        if (this.watched == null) {
            return false;
        }

        try {
            const material = MutualTlsServer.read();

            if (material.cert == null) {
                // Reachable while a mounted Secret is mid-update. The listener keeps the
                // material it already has, which is still valid, and the next tick retries.
                return false;
            }

            const fingerprint = MutualTlsServer.fingerprint(material);

            if (fingerprint === this.fingerprint) {
                return false;
            }

            this.watched.setSecureContext({
                cert: material.cert,
                key: material.key,
                ...(material.ca == null ? {} : {ca: material.ca}),
            } as tls.SecureContextOptions);
            this.fingerprint = fingerprint;

            this.logger.log('Reloaded listener TLS material; new handshakes will use it.');

            return true;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);

            this.logger.error(`Could not reload listener TLS material; keeping the current one: ${message}`);

            return false;
        }
    }

    private reloadIntervalMs(): number {
        return this.options.reloadIntervalMs ?? MutualTlsServer.DEFAULT_RELOAD_INTERVAL_MS;
    }

    private static read(): MutualTlsServer.Material {
        const pair = FspiopMtlsServerCertStore.readPem();

        return {
            cert: pair?.cert,
            key: pair?.key,
            ca: FspiopMtlsCaStore.readPem() ?? undefined,
        };
    }

    /**
     * Hashes the material rather than the file's timestamp: a Secret update rewrites
     * the file even when the bytes are unchanged, and rebuilding the context for that
     * would be work with no effect.
     */
    private static fingerprint(material: MutualTlsServer.Material): string {
        return createHash('sha256')
            .update(`${material.cert ?? ''} ${material.key ?? ''} ${material.ca ?? ''}`)
            .digest('hex');
    }
}

export namespace MutualTlsServer {

    export interface Material {
        cert: string | undefined;
        key: string | undefined;
        ca: string | undefined;
    }

    export interface Options {
        requestClientCert: boolean;
        reloadIntervalMs?: number;
    }
}
