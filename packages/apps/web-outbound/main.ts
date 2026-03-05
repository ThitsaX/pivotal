import 'reflect-metadata';
import {existsSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {Logger} from '@nestjs/common';
import {NestFactory} from '@nestjs/core';
import {DocumentBuilder, SwaggerModule} from '@nestjs/swagger';
import {config as loadDotEnv} from 'dotenv';
import {FspiopExceptionFilter, FspiopHeaders} from '@shared/fspiop';
import {WebOutboundAppModule} from './app.module';

const ROOT_ENV_LOCATION = '.env';
const MODULE_ENV_LOCATION = 'packages/apps/web-outbound/.env';
const DEFAULT_HTTP_PORT = 3200;
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

    const port = Number(process.env['WEB_OUTBOUND_PORT'] ?? DEFAULT_HTTP_PORT);

    const app = await NestFactory.create(WebOutboundAppModule);
    app.enableShutdownHooks();
    app.useGlobalFilters(new FspiopExceptionFilter());

    const swaggerConfig = new DocumentBuilder()
        .setTitle('PayPort Web Outbound')
        .setDescription('Outbound API for initiating FSPIOP lookup, quoting, and transfer flows')
        .setVersion('1.0.0')
        .addApiKey({type: 'apiKey', name: FspiopHeaders.Names.FSPIOP_SOURCE, in: 'header'}, FspiopHeaders.Names.FSPIOP_SOURCE)
        .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('v1.0.0/api-docs', app, document);

    await app.listen(port);
    Logger.log(`Web outbound is listening on port ${port}.`, 'Bootstrap');
};

void bootstrap();
