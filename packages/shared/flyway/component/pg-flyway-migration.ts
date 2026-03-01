import {Flyway} from 'node-flyway';

export type FlywaySettings = {
    /** PostgreSQL server address, e.g. "localhost" or "localhost:5432". */
    url: string;
    username: string;
    password: string;
    database: string;
    schema?: string;
    flywayTable?: string;
    locations: string[];
};

/**
 * Utility for running Flyway migrations against a PostgreSQL database.
 * All methods are static — instantiation is not required.
 *
 * Pass locations exactly as node-flyway expects them, e.g.:
 *   "/absolute/path/to/migrations"
 *   "filesystem:relative/path/to/migrations"
 */
export class PgFlywayMigration {

    static async migrate(settings: FlywaySettings): Promise<void> {
        await new Flyway({
            url: `jdbc:postgresql://${settings.url}/${settings.database}`,
            user: settings.username,
            password: settings.password,
            defaultSchema: settings.schema,
            migrationLocations: settings.locations,
            advanced: settings.flywayTable ? {schemaHistoryTable: settings.flywayTable} : undefined,
        }).migrate();
    }
}
