import 'reflect-metadata';
import {existsSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {Logger, ValidationPipe} from '@nestjs/common';
import {NestFactory} from '@nestjs/core';
import cookieParser = require('cookie-parser');
import {config as loadDotEnv} from 'dotenv';
import {json} from 'express';
import {AdminUserSeeder, RbacSeeder} from '@core/auth/domain';
import {DbMigration, DbMigrationSettings} from '@shared/dbmigration';
import {PivotalExceptionFilter} from '@shared/foundation';
import {WebPivotalAppModule} from './app.module';

const AUDIT_SQL_LOCATION = 'packages/core/audit/domain/sql';
const AUTH_SQL_LOCATION = 'packages/core/auth/domain/sql';
const PARTICIPANT_SQL_LOCATION = 'packages/core/participant/domain/sql';
const ROOT_ENV_LOCATION = '.env';
const MODULE_ENV_LOCATION = 'packages/apps/web-pivotal/.env';
const AUDIT_MIGRATION_TABLE = 'audit_migration_history';
const AUTH_MIGRATION_TABLE = 'auth_migration_history';
const PARTICIPANT_MIGRATION_TABLE = 'participant_migration_history';
const ROOT_MARKER_FILE = 'package.json';
const ROOT_MARKER_DIR = 'packages';

const readRequiredEnvironmentVariable = (name: string): string => {
    const value = process.env[name];

    if (value == null || value.trim().length === 0) {
        throw new Error(`Missing required environment variable: ${name}`);
    }

    return value;
};

const formatStep = (step: {inserted: number; skipped: boolean}): string => {
    return step.skipped ? 'skipped' : `${step.inserted}`;
};

const readCorsAllowedOrigins = (): string[] => {
    const value = process.env['PIVOTAL_IAM_CORS_ALLOWED_ORIGINS'];

    if (value == null || value.trim().length === 0) {
        return [];
    }

    return value.split(',').map((origin) => origin.trim()).filter((origin) => origin.length > 0);
};

const readRequiredPort = (name: string): number => {
    const value = readRequiredEnvironmentVariable(name);
    const parsed = Number(value);

    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`Invalid environment variable ${name}: expected a positive integer.`);
    }

    return parsed;
};

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
): DbMigrationSettings => ({
    host:         readRequiredEnvironmentVariable('DB_WRITE_HOST'),
    port:         readRequiredPort('DB_WRITE_PORT'),
    username:     readRequiredEnvironmentVariable('DB_WRITE_USERNAME'),
    password:     readRequiredEnvironmentVariable('DB_WRITE_PASSWORD'),
    database:     readRequiredEnvironmentVariable('DB_WRITE_NAME'),
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
    const authLocation = resolve(repoRoot, AUTH_SQL_LOCATION);
    const participantLocation = resolve(repoRoot, PARTICIPANT_SQL_LOCATION);

    Logger.log(`Running audit migrations from ${auditLocation}.`, 'Bootstrap');
    const auditResult = await DbMigration.migrate(
        createMigrationSettings(AUDIT_MIGRATION_TABLE, [auditLocation]),
    );

    Logger.log(
        `Audit migrations done — executed: ${auditResult.migrationsExecuted}.`,
        'Bootstrap',
    );

    Logger.log(`Running auth migrations from ${authLocation}.`, 'Bootstrap');
    const authResult = await DbMigration.migrate(
        createMigrationSettings(AUTH_MIGRATION_TABLE, [authLocation]),
    );

    Logger.log(
        `Auth migrations done — executed: ${authResult.migrationsExecuted}.`,
        'Bootstrap',
    );

    Logger.log(`Running participant migrations from ${participantLocation}.`, 'Bootstrap');
    const participantResult = await DbMigration.migrate(
        createMigrationSettings(PARTICIPANT_MIGRATION_TABLE, [participantLocation]),
    );

    Logger.log(
        `Participant migrations done — executed: ${participantResult.migrationsExecuted}.`,
        'Bootstrap',
    );

    const port = readRequiredPort('WEB_PIVOTAL_PORT');

    const app = await NestFactory.create(WebPivotalAppModule);

    Logger.log('Running auth seeders.', 'Bootstrap');
    const rbacResult = await app.get(RbacSeeder).seed();
    Logger.log(
        `RBAC seed: roles=${formatStep(rbacResult.roles)}, permissions=${formatStep(rbacResult.permissions)}, role_permissions=${formatStep(rbacResult.rolePermissions)}, menus=${formatStep(rbacResult.menus)}, menu_permissions=${formatStep(rbacResult.menuPermissions)}.`,
        'Bootstrap',
    );

    const adminSeedResult = await app.get(AdminUserSeeder).seed();
    Logger.log(
        adminSeedResult.inserted
            ? `Admin seed: inserted '${adminSeedResult.email}' with must_change_password=true.`
            : 'Admin seed skipped (users table already populated).',
        'Bootstrap',
    );

    app.enableShutdownHooks();
    app.useGlobalFilters(new PivotalExceptionFilter());
    app.useGlobalPipes(new ValidationPipe({
        whitelist:            true,
        forbidNonWhitelisted: true,
        transform:            true,
    }));
    const corsAllowedOrigins = readCorsAllowedOrigins();

    if (corsAllowedOrigins.length === 0) {
        Logger.warn(
            'PIVOTAL_IAM_CORS_ALLOWED_ORIGINS is not set; no cross-origin requests will be permitted.',
            'Bootstrap',
        );
    } else {
        Logger.log(`CORS allow-list: ${corsAllowedOrigins.join(', ')}.`, 'Bootstrap');
    }

    app.enableCors({
        origin:      corsAllowedOrigins,
        methods:     ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        credentials: true,
    });
    app.use(json({type: ['application/json', 'application/*+json']}));
    app.use(cookieParser());

    await app.listen(port);
    Logger.log(`Web pivotal is listening on port ${port}.`, 'Bootstrap');
};

void bootstrap();
