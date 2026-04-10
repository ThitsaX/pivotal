import 'reflect-metadata';
import {existsSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {Logger} from '@nestjs/common';
import {NestFactory} from '@nestjs/core';
import {config as loadDotEnv} from 'dotenv';
import {PgMigration, PgMigrationSettings} from '@shared/pg-migration';

const AUDIT_SQL_LOCATION = 'packages/core/audit/domain/sql';
const PARTICIPANT_SQL_LOCATION = 'packages/core/participant/domain/sql';
const ROOT_ENV_LOCATION = '.env';
const MODULE_ENV_LOCATION = 'packages/apps/app-auditor/.env';
const AUDIT_MIGRATION_TABLE = 'audit_migration_history';
const PARTICIPANT_MIGRATION_TABLE = 'participant_migration_history';
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

const createMigrationSettings = (
    historyTable: string,
    locations: string[],
): PgMigrationSettings => ({
    host:         process.env['DB_WRITE_HOST']     ?? 'localhost',
    port:         Number(process.env['DB_WRITE_PORT'] ?? 3306),
    username:     process.env['DB_WRITE_USERNAME'] ?? 'root',
    password:     process.env['DB_WRITE_PASSWORD'] ?? 'mysql',
    database:     process.env['DB_WRITE_NAME']     ?? 'pivotal',
    historyTable,
    locations,
});

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

    const auditLocation = resolve(repoRoot, AUDIT_SQL_LOCATION);
    const participantLocation = resolve(repoRoot, PARTICIPANT_SQL_LOCATION);

    Logger.log(`Running audit migrations from ${auditLocation}.`, 'Bootstrap');
    const auditResult = await PgMigration.migrate(
        createMigrationSettings(AUDIT_MIGRATION_TABLE, [auditLocation]),
    );

    Logger.log(
        `Audit migrations done — executed: ${auditResult.migrationsExecuted}.`,
        'Bootstrap',
    );

    Logger.log(`Running participant migrations from ${participantLocation}.`, 'Bootstrap');
    const participantResult = await PgMigration.migrate(
        createMigrationSettings(PARTICIPANT_MIGRATION_TABLE, [participantLocation]),
    );

    Logger.log(
        `Participant migrations done — executed: ${participantResult.migrationsExecuted}.`,
        'Bootstrap',
    );

    const {AuditConsumerAppModule} = await import('./app.module');
    const app = await NestFactory.createApplicationContext(AuditConsumerAppModule);
    app.enableShutdownHooks();

    Logger.log('Audit consumer is running.', 'Bootstrap');
};

void bootstrap();
