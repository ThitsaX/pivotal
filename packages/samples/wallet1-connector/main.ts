// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import 'reflect-metadata';
import {existsSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {Logger} from '@nestjs/common';
import {NestFactory} from '@nestjs/core';
import {config as loadDotEnv} from 'dotenv';

const ROOT_ENV_LOCATION = '.env';
const MODULE_ENV_LOCATION = 'packages/samples/wallet1-connector/.env';
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

    const {Wallet1ConnectorAppModule} = await import('./app.module');
    const app = await NestFactory.createApplicationContext(Wallet1ConnectorAppModule);
    app.enableShutdownHooks();

    Logger.log('Wallet1 connector is running.', 'Bootstrap');
};

void bootstrap();
