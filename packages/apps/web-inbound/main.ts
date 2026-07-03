// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import 'reflect-metadata';
import {existsSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {Logger} from '@nestjs/common';
import {NestFactory} from '@nestjs/core';
import {config as loadDotEnv} from 'dotenv';
import {json} from 'express';
import {FspInboundGuard, FspiopExceptionFilter, PivotalLogger} from '@shared/fspiop';
import {WebInboundSettings} from './required.settings';
import {WebInboundAppModule} from './app.module';

const ROOT_ENV_LOCATION = '.env';
const MODULE_ENV_LOCATION = 'packages/apps/web-inbound/.env';
const DEFAULT_HTTP_PORT = 3201;
const ROOT_MARKER_FILE = 'package.json';
const ROOT_MARKER_DIR = 'packages';

const findRepoRoot = (): string => {
    const startPoints = [process.cwd(), dirname(process.argv[1] ?? process.cwd())];

    for (const startPoint of startPoints) {
        let current = resolve(startPoint);

        while (true) {
            const markerFile = resolve(current, ROOT_MARKER_FILE);
            const markerDir = resolve(current, ROOT_MARKER_DIR);

            if (existsSync(markerFile) && existsSync(markerDir)) {
                return current;
            }

            const parent = resolve(current, '..');
            if (parent === current) {
                break;
            }

            current = parent;
        }
    }

    return process.cwd();
};

const resolveHttpsOptions = (
    settings: WebInboundSettings,
    useMutualTls: boolean,
): Record<string, unknown> | undefined => {
    if (!useMutualTls) {
        return undefined;
    }

    const ca = settings.caStore().get();
    if (ca == null || ca.toBuffer().length === 0) {
        throw new Error('FSPIOP_USE_MUTUAL_TLS=false requires FSPIOP_MTLS_CA.');
    }

    const clientCert = settings.clientCertStore().get();
    if (clientCert == null) {
        throw new Error('FSPIOP_USE_MUTUAL_TLS=false requires FSPIOP_MTLS_CLIENT_CERT and FSPIOP_MTLS_CLIENT_KEY.');
    }

    return {
        ca: ca.toBuffer(),
        cert: clientCert.certBuffer(),
        key: clientCert.keyBuffer(),
        requestCert: true,
        rejectUnauthorized: true,
    };
};

const bootstrap = async (): Promise<void> => {
    const repoRoot = findRepoRoot();

    const rootEnvPath = resolve(repoRoot, ROOT_ENV_LOCATION);
    const moduleEnvPath = resolve(repoRoot, MODULE_ENV_LOCATION);

    if (existsSync(rootEnvPath)) {
        loadDotEnv({path: rootEnvPath});
        Logger.log(`Loaded env from ${rootEnvPath}.`, 'Bootstrap');
    }

    if (existsSync(moduleEnvPath)) {
        loadDotEnv({path: moduleEnvPath, override: true});
        Logger.log(`Loaded env from ${moduleEnvPath}.`, 'Bootstrap');
    }

    const port = Number(process.env['WEB_INBOUND_PORT'] ?? DEFAULT_HTTP_PORT);
    const deps = new WebInboundSettings();
    const settings = deps.fspiopSettings();
    const httpsOptions = resolveHttpsOptions(deps, settings.useMutualTls);
    const nestOptions = {
        logger: new PivotalLogger(),
        ...(httpsOptions == null ? {} : {httpsOptions: httpsOptions as any}),
    };

    const app = await NestFactory.create(WebInboundAppModule, nestOptions);
    app.enableShutdownHooks();
    app.use(json({type: ['application/json', 'application/*+json']}));
    app.useGlobalFilters(new FspiopExceptionFilter());

    if (settings.useJws) {
        app.useGlobalGuards(app.get(FspInboundGuard));
        Logger.log('FspInboundGuard is enabled.', 'Bootstrap');
    }

    if (settings.useMutualTls) {
        Logger.log('Inbound mTLS is enabled.', 'Bootstrap');
    }

    // Keep the server's idle keep-alive window LONGER than any client/proxy that pools
    // connections to us (the Hub quoting-service-handler and our own sidecar Envoy).
    // Node's default keepAliveTimeout is 5s, which is shorter than upstream idle windows,
    // so the server closes idle sockets first and reused sockets fail with read ECONNRESET.
    // headersTimeout must stay above keepAliveTimeout.
    const httpServer = app.getHttpServer();
    httpServer.keepAliveTimeout = Number(process.env['WEB_INBOUND_KEEP_ALIVE_TIMEOUT_MS'] ?? 65000);
    httpServer.headersTimeout = Number(process.env['WEB_INBOUND_HEADERS_TIMEOUT_MS'] ?? 66000);

    await app.listen(port);
    const protocol = settings.useMutualTls ? 'https' : 'http';
    Logger.log(`Web inbound is listening on ${protocol} port ${port}.`, 'Bootstrap');
};

void bootstrap();
