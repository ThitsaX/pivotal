import {readdir, readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {Connection, createConnection} from 'mysql2/promise';

export type PgMigrationSettings = {
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
 *   - Same version + same filename  → already applied, skip silently.
 *   - Same version + different filename → version conflict, throw immediately.
 *   - Version not yet in history    → execute and record.
 */
export class PgMigration {

    private static readonly MIGRATION_FILE_RE = /^V([\d]+(?:_[\d]+)*)__(.+)\.sql$/i;

    private static escapeIdentifier(value: string): string {
        return value.replace(/`/g, '``');
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
                const match = file.match(PgMigration.MIGRATION_FILE_RE);
                if (!match) {
                    continue;
                }

                const versionRaw = match[1];
                const description = match[2].replace(/_/g, ' ');

                migrations.push({
                    version: versionRaw.replace(/_/g, '.'),
                    versionTuple: PgMigration.parseVersionTuple(versionRaw),
                    description,
                    filename: file,
                    fullPath: join(location, file),
                });
            }
        }

        return migrations.sort((a, b) =>
            PgMigration.compareVersions(a.versionTuple, b.versionTuple),
        );
    }

    // ── history table ────────────────────────────────────────────────────────

    private static async ensureHistoryTable(connection: Connection, table: string): Promise<void> {
        const escapedTable = PgMigration.escapeIdentifier(table);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS \`${escapedTable}\` (
                \`installed_rank\` BIGINT NOT NULL AUTO_INCREMENT,
                \`version\` VARCHAR(50) NOT NULL,
                \`description\` VARCHAR(200) NOT NULL,
                \`script\` VARCHAR(1000) NOT NULL,
                \`installed_by\` VARCHAR(100) NOT NULL DEFAULT 'migration',
                \`installed_on\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                \`execution_time\` INT NOT NULL,
                \`success\` BOOLEAN NOT NULL,
                PRIMARY KEY (\`installed_rank\`),
                UNIQUE KEY \`${escapedTable}_version_uk\` (\`version\`),
                UNIQUE KEY \`${escapedTable}_script_uk\` (\`script\`)
            ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci
        `);
    }

    /**
     * Returns a map of version → applied filename for all successfully applied migrations.
     * Used to detect already-applied migrations and version conflicts.
     */
    private static async getAppliedMigrations(
        connection: Connection,
        table: string,
    ): Promise<Map<string, string>> {
        const escapedTable = PgMigration.escapeIdentifier(table);
        const [rows] = await connection.query(
            `SELECT version, script FROM \`${escapedTable}\` WHERE success = true`,
        ) as [{version: string; script: string}[], unknown];

        return new Map(rows.map((row) => [row.version, row.script]));
    }

    private static async recordMigration(
        connection: Connection,
        table: string,
        migration: MigrationFile,
        executionTime: number,
    ): Promise<void> {
        const escapedTable = PgMigration.escapeIdentifier(table);

        await connection.query(
            `INSERT INTO \`${escapedTable}\`
             (version, description, script, installed_by, execution_time, success)
             VALUES (?, ?, ?, CURRENT_USER(), ?, true)`,
            [migration.version, migration.description, migration.filename, executionTime],
        );
    }

    // ── public API ───────────────────────────────────────────────────────────

    static async migrate(settings: PgMigrationSettings): Promise<PgMigration.Result> {
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
            await PgMigration.ensureHistoryTable(connection, historyTable);

            const all = await PgMigration.discoverMigrations(settings.locations);
            const applied = await PgMigration.getAppliedMigrations(connection, historyTable);

            let migrationsExecuted = 0;

            for (const migration of all) {
                const appliedFilename = applied.get(migration.version);

                if (appliedFilename !== undefined) {
                    if (appliedFilename === migration.filename) {
                        // Same version, same filename — already applied, skip.
                        continue;
                    }

                    // Same version, different filename — conflict.
                    throw new Error(
                        `Migration version conflict: version ${migration.version} was previously applied` +
                        ` as "${appliedFilename}" but the current file is "${migration.filename}".`,
                    );
                }

                // New migration — execute inside a transaction.
                const sql = await readFile(migration.fullPath, 'utf-8');
                const start = Date.now();

                await connection.beginTransaction();
                try {
                    await connection.query(sql);
                    await PgMigration.recordMigration(
                        connection,
                        historyTable,
                        migration,
                        Date.now() - start,
                    );
                    await connection.commit();
                    migrationsExecuted++;
                } catch (error) {
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

export namespace PgMigration {
    export type Result = {
        database: string;
        migrationsExecuted: number;
    };
}
