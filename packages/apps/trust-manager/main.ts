// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import 'reflect-metadata';
import {existsSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {Logger} from '@nestjs/common';
import {NestFactory} from '@nestjs/core';
import {config as loadDotEnv} from 'dotenv';

const ROOT_ENV_LOCATION = '.env';
const MODULE_ENV_LOCATION = 'packages/apps/trust-manager/.env';
const ROOT_MARKER_FILE = 'package.json';
const ROOT_MARKER_DIR = 'packages';

const findRepoRoot = (): string => {
    const startPoints = [process.cwd(), dirname(process.argv[1] ?? process.cwd())];

    for (const startPoint of startPoints) {
        let current = resolve(startPoint);

        while (true) {
            if (existsSync(resolve(current, ROOT_MARKER_FILE)) && existsSync(resolve(current, ROOT_MARKER_DIR))) {
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

/**
 * trust-manager runs no HTTP listener yet. It is a control plane with a scheduler:
 * the data plane never calls it, so a control-plane outage cannot stop a transfer.
 *
 * It also runs **no migrations**. `participant_key` is owned by the participant
 * domain and migrated by web-pivotal and app-auditor; two processes racing the same
 * history table on startup is a failure mode worth not having.
 */
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

    const {TrustManagerAppModule} = await import('./app.module');
    const app = await NestFactory.createApplicationContext(TrustManagerAppModule);
    app.enableShutdownHooks();

    Logger.log('Trust manager is running.', 'Bootstrap');
};

void bootstrap();
