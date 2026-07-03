// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {Logger} from '@nestjs/common';
import {createHash} from 'node:crypto';
import {readdir, readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {Connection, createConnection} from 'mysql2/promise';

export type DbMigrationSettings = {
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
    /** Name of the migration history table. Default: `migration_history`. */
    historyTable?: string;
    /** Absolute paths to directories that contain `V{version}__{description}.sql` files. */
    locations: string[];
};

interface MigrationFile {
    /** Dot-separated version string, e.g. `1.1`. */
    version: string;
    /** Numeric tuple used for deterministic sorting, e.g. `[1, 1]`. */
    versionTuple: number[];
    description: string;
    filename: string;
    fullPath: string;
    sql: string;
    hash: string;
}

interface AppliedMigration {
    version: string;
    script: string;
    hash: string | null;
}

/**
 * Lightweight SQL migration runner for MySQL — no Java, no CLI, no extra dependencies.
 *
 * Follows Flyway's file-naming convention:
 *   `V{version}__{description}.sql`   e.g. `V1_1__create_tables.sql`
 *
 * Applied migrations are tracked in a history table (default: `migration_history`).
 * Each migration runs inside its own transaction and is rolled back on failure.
 *
 * Per-migration rules:
 *   - Same version + same hash      → already applied, skip silently.
 *   - Same version + different hash → version conflict, throw immediately.
 *   - Different version + same hash → content conflict, throw immediately.
 *   - Version not yet in history    → execute and record.
 */
export class DbMigration {

    private static readonly MIGRATION_FILE_RE = /^V([\d]+(?:_[\d]+)*)__(.+)\.sql$/i;
    private static readonly logger = new Logger(DbMigration.name);

    private static escapeIdentifier(value: string): string {
        return value.replace(/`/g, '``');
    }

    private static calculateHash(sql: string): string {
        return createHash('sha256').update(sql).digest('hex');
    }

    // ── version helpers ──────────────────────────────────────────────────────

    private static parseVersionTuple(raw: string): number[] {
        return raw.replace(/\./g, '_').split('_').map(Number);
    }

    private static compareVersions(a: number[], b: number[]): number {
        const len = Math.max(a.length, b.length);
        for (let i = 0; i < len; i++) {
            const diff = (a[i] ?? 0) - (b[i] ?? 0);
            if (diff !== 0) {
                return diff;
            }
        }
        return 0;
    }

    // ── discovery ────────────────────────────────────────────────────────────

    private static async discoverMigrations(locations: string[]): Promise<MigrationFile[]> {
        const migrations: MigrationFile[] = [];

        for (const location of locations) {
            let files: string[];
            try {
                files = await readdir(location);
            } catch {
                throw new Error(`Migration location not found or unreadable: ${location}`);
            }

            for (const file of files) {
                const match = file.match(DbMigration.MIGRATION_FILE_RE);
                if (!match) {
                    continue;
                }

                const versionRaw = match[1];
                const description = match[2].replace(/_/g, ' ');
                const fullPath = join(location, file);
                const sql = await readFile(fullPath, 'utf-8');

                migrations.push({
                    version: versionRaw.replace(/_/g, '.'),
                    versionTuple: DbMigration.parseVersionTuple(versionRaw),
                    description,
                    filename: file,
                    fullPath,
                    sql,
                    hash: DbMigration.calculateHash(sql),
                });
            }
        }

        return migrations.sort((a, b) =>
            DbMigration.compareVersions(a.versionTuple, b.versionTuple),
        );
    }

    // ── history table ────────────────────────────────────────────────────────

    private static async hasColumn(
        connection: Connection,
        table: string,
        column: string,
    ): Promise<boolean> {
        const [rows] = await connection.query(
            `SELECT COUNT(*) AS count
             FROM information_schema.columns
             WHERE table_schema = DATABASE()
               AND table_name = ?
               AND column_name = ?`,
            [table, column],
        ) as [{count: number}[], unknown];

        return rows[0]?.count > 0;
    }

    private static async hasIndex(
        connection: Connection,
        table: string,
        index: string,
    ): Promise<boolean> {
        const [rows] = await connection.query(
            `SELECT COUNT(*) AS count
             FROM information_schema.statistics
             WHERE table_schema = DATABASE()
               AND table_name = ?
               AND index_name = ?`,
            [table, index],
        ) as [{count: number}[], unknown];

        return rows[0]?.count > 0;
    }

    private static async getAppliedMigrations(
        connection: Connection,
        table: string,
    ): Promise<AppliedMigration[]> {
        const escapedTable = DbMigration.escapeIdentifier(table);
        const hasHashColumn = await DbMigration.hasColumn(connection, table, 'hash');
        const hashColumnDefinition = hasHashColumn
            ? '`hash` CHAR(64) NOT NULL,'
            : '`hash` CHAR(64) NULL,';

        await connection.query(`
            CREATE TABLE IF NOT EXISTS \`${escapedTable}\` (
                \`installed_rank\` BIGINT NOT NULL AUTO_INCREMENT,
                \`version\` VARCHAR(50) NOT NULL,
                \`description\` VARCHAR(200) NOT NULL,
                \`script\` VARCHAR(1000) NOT NULL,
                ${hashColumnDefinition}
                \`installed_by\` VARCHAR(100) NOT NULL DEFAULT 'migration',
                \`installed_on\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                \`execution_time\` INT NOT NULL,
                \`success\` BOOLEAN NOT NULL,
                PRIMARY KEY (\`installed_rank\`),
                UNIQUE KEY \`${escapedTable}_version_uk\` (\`version\`),
                UNIQUE KEY \`${escapedTable}_hash_uk\` (\`hash\`)
            ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci
        `);
        const selectHash = hasHashColumn ? '`hash`' : 'NULL AS `hash`';
        const [rows] = await connection.query(
            `SELECT version, script, ${selectHash} FROM \`${escapedTable}\` WHERE success = true`,
        ) as [AppliedMigration[], unknown];

        return rows;
    }

    private static async ensureHistoryTable(
        connection: Connection,
        table: string,
        migrations: MigrationFile[],
    ): Promise<void> {
        const escapedTable = DbMigration.escapeIdentifier(table);
        const hashIndex = `${escapedTable}_hash_uk`;
        const scriptIndex = `${escapedTable}_script_uk`;
        const migrationsByVersion = new Map(
            migrations.map((migration) => [migration.version, migration]),
        );

        let applied = await DbMigration.getAppliedMigrations(connection, table);

        const hasHashColumn = await DbMigration.hasColumn(connection, table, 'hash');
        if (!hasHashColumn) {
            await connection.query(
                `ALTER TABLE \`${escapedTable}\` ADD COLUMN \`hash\` CHAR(64) NULL AFTER \`script\``,
            );
            applied = await DbMigration.getAppliedMigrations(connection, table);
        }

        for (const appliedMigration of applied) {
            if (appliedMigration.hash !== null && appliedMigration.hash !== '') {
                continue;
            }

            const migration = migrationsByVersion.get(appliedMigration.version);
            if (migration === undefined) {
                throw new Error(
                    `Unable to backfill hash for applied migration version ${appliedMigration.version}` +
                    ` in history table "${table}" because the migration file is not available.`,
                );
            }

            await connection.query(
                `UPDATE \`${escapedTable}\` SET \`hash\` = ? WHERE \`version\` = ?`,
                [migration.hash, appliedMigration.version],
            );
        }

        await connection.query(
            `ALTER TABLE \`${escapedTable}\` MODIFY COLUMN \`hash\` CHAR(64) NOT NULL`,
        );

        if (!await DbMigration.hasIndex(connection, table, hashIndex)) {
            await connection.query(
                `ALTER TABLE \`${escapedTable}\` ADD UNIQUE KEY \`${hashIndex}\` (\`hash\`)`,
            );
        }

        if (await DbMigration.hasIndex(connection, table, scriptIndex)) {
            await connection.query(
                `ALTER TABLE \`${escapedTable}\` DROP INDEX \`${scriptIndex}\``,
            );
        }
    }

    private static async recordMigration(
        connection: Connection,
        table: string,
        migration: MigrationFile,
        executionTime: number,
    ): Promise<void> {
        const escapedTable = DbMigration.escapeIdentifier(table);

        await connection.query(
            `INSERT INTO \`${escapedTable}\`
             (version, description, script, hash, installed_by, execution_time, success)
             VALUES (?, ?, ?, ?, CURRENT_USER(), ?, true)`,
            [
                migration.version,
                migration.description,
                migration.filename,
                migration.hash,
                executionTime,
            ],
        );
    }

    // ── public API ───────────────────────────────────────────────────────────

    static async migrate(settings: DbMigrationSettings): Promise<DbMigration.Result> {
        const historyTable = settings.historyTable ?? 'migration_history';

        const connection = await createConnection({
            host: settings.host,
            port: settings.port,
            user: settings.username,
            password: settings.password,
            database: settings.database,
            multipleStatements: true,
        });

        try {
            const all = await DbMigration.discoverMigrations(settings.locations);
            await DbMigration.ensureHistoryTable(connection, historyTable, all);

            const applied = await DbMigration.getAppliedMigrations(connection, historyTable);
            const appliedByVersion = new Map(
                applied.map((migration) => [migration.version, migration]),
            );
            const appliedByHash = new Map(
                applied
                    .filter((migration) => migration.hash !== null && migration.hash !== '')
                    .map((migration) => [migration.hash as string, migration]),
            );

            let migrationsExecuted = 0;

            for (const migration of all) {
                const appliedMigration = appliedByVersion.get(migration.version);

                if (appliedMigration !== undefined) {
                    if (appliedMigration.hash === migration.hash) {
                        // Same version, same content hash — already applied, skip.
                        continue;
                    }

                    // Same version, different content hash — conflict.
                    throw new Error(
                        `Migration version conflict: version ${migration.version} was previously applied` +
                        ` as "${appliedMigration.script}" with hash "${appliedMigration.hash}"` +
                        ` but the current file is "${migration.filename}" with hash "${migration.hash}".`,
                    );
                }

                const appliedHashMigration = appliedByHash.get(migration.hash);
                if (appliedHashMigration !== undefined) {
                    throw new Error(
                        `Migration content conflict: hash "${migration.hash}" was previously applied` +
                        ` as version ${appliedHashMigration.version} in "${appliedHashMigration.script}"` +
                        ` but the current file is "${migration.filename}" with version ${migration.version}.`,
                    );
                }

                // New migration — execute inside a transaction.
                const start = Date.now();

                await connection.beginTransaction();
                try {
                    await connection.query(migration.sql);
                    await DbMigration.recordMigration(
                        connection,
                        historyTable,
                        migration,
                        Date.now() - start,
                    );
                    await connection.commit();
                    migrationsExecuted++;
                    appliedByVersion.set(migration.version, {
                        version: migration.version,
                        script: migration.filename,
                        hash: migration.hash,
                    });
                    appliedByHash.set(migration.hash, {
                        version: migration.version,
                        script: migration.filename,
                        hash: migration.hash,
                    });
                } catch (error) {
                    DbMigration.logger.error(
                        `Migration ${migration.filename} failed.`,
                        error instanceof Error ? error.stack : String(error),
                    );
                    await connection.rollback();
                    throw new Error(
                        `Migration ${migration.filename} failed: ${(error as Error).message}`,
                    );
                }
            }

            return {
                database: settings.database,
                migrationsExecuted,
            };
        } finally {
            await connection.end();
        }
    }
}

export namespace DbMigration {
    export type Result = {
        database: string;
        migrationsExecuted: number;
    };
}
