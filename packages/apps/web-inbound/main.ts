import 'reflect-metadata';
import {existsSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {Logger} from '@nestjs/common';
import {NestFactory} from '@nestjs/core';
import {config as loadDotEnv} from 'dotenv';
import {json} from 'express';
import {FspiopJwsGuard} from '@shared/fspiop';
import {WebInboundDependencies} from './required.dependencies';
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
    deps: WebInboundDependencies,
    useMutualTls: boolean,
): Record<string, unknown> | undefined => {
    if (!useMutualTls) {
        return undefined;
    }

    const ca = deps.caStore().toBuffer();
    if (ca == null || ca.length === 0) {
        throw new Error('FSPIOP_USE_MUTUAL_TLS=true requires CA certificates (FSPIOP_MTLS_CA_COUNT/FSPIOP_MTLS_CA_CONTENT_N or JSON_CA_CERTS).');
    }

    const clientCert = deps.clientCertStore().get();
    if (clientCert == null) {
        throw new Error('FSPIOP_USE_MUTUAL_TLS=true requires CLIENT_CERT_CONTENT and CLIENT_CERT_KEY (or JSON_CLIENT_CERT).');
    }

    return {
        ca,
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
    const deps = new WebInboundDependencies();
    const settings = deps.fspiopSettings();
    const httpsOptions = resolveHttpsOptions(deps, settings.useMutualTls);
    const nestOptions = httpsOptions == null ? {} : {httpsOptions: httpsOptions as any};

    const app = await NestFactory.create(WebInboundAppModule, nestOptions);
    app.enableShutdownHooks();
    app.use(json({type: ['application/json', 'application/*+json']}));
    if (settings.useJws) {
        app.useGlobalGuards(new FspiopJwsGuard(deps.publicKeyStore(), settings));
        Logger.log('FspiopJwsGuard is enabled.', 'Bootstrap');
    }

    if (settings.useMutualTls) {
        Logger.log('Inbound mTLS is enabled.', 'Bootstrap');
    }

    await app.listen(port);
    const protocol = settings.useMutualTls ? 'https' : 'http';
    Logger.log(`Web inbound is listening on ${protocol} port ${port}.`, 'Bootstrap');
};

void bootstrap();
