import 'reflect-metadata';
import {existsSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {Logger} from '@nestjs/common';
import {NestFactory} from '@nestjs/core';
import {config as loadDotEnv} from 'dotenv';
import {PgMigration} from '@shared/pg-migration';

const SQL_LOCATION = 'packages/core/audit/domain/sql';
const ROOT_ENV_LOCATION = '.env';
const MODULE_ENV_LOCATION = 'packages/core/audit/consumer/.env';
const MIGRATION_TABLE = 'migration_history';
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

    const location = resolve(repoRoot, SQL_LOCATION);
    Logger.log(`Running migrations from ${location}.`, 'Bootstrap');

    const result = await PgMigration.migrate({
        host:         process.env['DB_WRITE_HOST']     ?? 'localhost',
        port:         Number(process.env['DB_WRITE_PORT'] ?? 5432),
        username:     process.env['DB_WRITE_USERNAME'] ?? 'postgres',
        password:     process.env['DB_WRITE_PASSWORD'] ?? 'postgres',
        database:     process.env['DB_WRITE_NAME']     ?? 'payport',
        schema:       process.env['DB_WRITE_SCHEMA']   ?? 'public',
        historyTable: MIGRATION_TABLE,
        locations:    [location],
    });

    Logger.log(
        `Migrations done — executed: ${result.migrationsExecuted}.`,
        'Bootstrap',
    );

    const {AuditConsumerAppModule} = await import('./app.module');
    const app = await NestFactory.createApplicationContext(AuditConsumerAppModule);
    app.enableShutdownHooks();

    Logger.log('Audit consumer is running.', 'Bootstrap');
};

void bootstrap();
