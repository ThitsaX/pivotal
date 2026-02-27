import {Injectable} from '@nestjs/common';
import {existsSync, readdirSync} from 'node:fs';
import {relative, resolve} from 'node:path';
import {Flyway} from 'node-flyway';
import {ExecutionOptions, FlywayConfig, FlywayOptionalConfig} from 'node-flyway/dist/types/types';

@Injectable()
export class FlywayMigration {

    private static readonly CLASSPATH_PREFIX = 'classpath:';
    private static readonly DEFAULT_CLASSPATH_ROOTS = ['packages', 'dist'];

    async migrate(options: FlywayMigration.Options = {}): Promise<FlywayMigration.MigrateResponse> {
        return this.createFlyway(options).migrate(FlywayMigration.normalizeFlywayOptionalConfig(options.commandConfig));
    }

    async info(options: FlywayMigration.Options = {}): Promise<FlywayMigration.InfoResponse> {
        return this.createFlyway(options).info(FlywayMigration.normalizeFlywayOptionalConfig(options.commandConfig));
    }

    async validate(options: FlywayMigration.Options = {}): Promise<FlywayMigration.ValidateResponse> {
        return this.createFlyway(options).validate(FlywayMigration.normalizeFlywayOptionalConfig(options.commandConfig));
    }

    async clean(options: FlywayMigration.Options = {}): Promise<FlywayMigration.CleanResponse> {
        return this.createFlyway(options).clean(FlywayMigration.normalizeFlywayOptionalConfig(options.commandConfig));
    }

    async baseline(options: FlywayMigration.Options = {}): Promise<FlywayMigration.BaselineResponse> {
        return this.createFlyway(options).baseline(FlywayMigration.normalizeFlywayOptionalConfig(options.commandConfig));
    }

    async repair(options: FlywayMigration.Options = {}): Promise<FlywayMigration.RepairResponse> {
        return this.createFlyway(options).repair(FlywayMigration.normalizeFlywayOptionalConfig(options.commandConfig));
    }

    private createFlyway(options: FlywayMigration.Options): Flyway {
        if (!options.config) {
            throw new Error('Flyway config is required. Pass options.config or use FlywayMigration.buildConfig(...).');
        }

        const config = FlywayMigration.normalizeFlywayConfig(options.config);
        const executionOptions = options.executionOptions;

        return new Flyway(config, executionOptions, options.debug);
    }

    static buildConfig(values: FlywayMigration.BuildConfigValues): FlywayConfig {
        const config: FlywayConfig = {
            url: values.url,
            user: values.user,
            migrationLocations: FlywayMigration.resolveMigrationLocations(values.migrationLocations),
        };

        if (values.password) {
            config.password = values.password;
        }

        if (values.defaultSchema) {
            config.defaultSchema = values.defaultSchema;
        }

        if (values.table) {
            config.advanced = {
                ...config.advanced,
                schemaHistoryTable: values.table,
            };
        }

        if (values.advanced) {
            config.advanced = {
                ...config.advanced,
                ...values.advanced,
            };
        }

        return config;
    }

    static normalizeFlywayConfig(config: FlywayConfig): FlywayConfig {
        return {
            ...config,
            migrationLocations: FlywayMigration.resolveMigrationLocations(config.migrationLocations),
        };
    }

    static normalizeFlywayOptionalConfig(config?: FlywayOptionalConfig): FlywayOptionalConfig | undefined {
        if (!config || !config.migrationLocations) {
            return config;
        }

        return {
            ...config,
            migrationLocations: FlywayMigration.resolveMigrationLocations(config.migrationLocations),
        };
    }

    private static resolveMigrationLocations(locations: string[]): string[] {
        const resolvedLocations: string[] = [];

        for (const location of locations) {
            if (!location.startsWith(FlywayMigration.CLASSPATH_PREFIX)) {
                resolvedLocations.push(location);
                continue;
            }

            const classpathPattern = location.slice(FlywayMigration.CLASSPATH_PREFIX.length).trim();
            const classpathMatches = FlywayMigration.resolveClasspathPattern(classpathPattern);

            if (classpathMatches.length === 0) {
                throw new Error(`No migration directory found for location: ${location}`);
            }

            resolvedLocations.push(...classpathMatches);
        }

        return [...new Set(resolvedLocations)];
    }

    private static resolveClasspathPattern(classpathPattern: string): string[] {
        const normalizedPattern = FlywayMigration.normalizePattern(classpathPattern);
        const cwd = process.cwd();
        const classpathRoots = FlywayMigration.getClasspathRoots(cwd);
        const matchedDirectories: string[] = [];

        for (const classpathRoot of classpathRoots) {
            const directories = FlywayMigration.collectDirectories(classpathRoot);

            for (const directory of directories) {
                const relativePath = FlywayMigration.normalizePattern(relative(cwd, directory));

                if (FlywayMigration.matchesPattern(relativePath, normalizedPattern)) {
                    matchedDirectories.push(directory);
                }
            }
        }

        return [...new Set(matchedDirectories)];
    }

    private static getClasspathRoots(cwd: string): string[] {
        const configuredRoots = process.env.FLYWAY_CLASSPATH_ROOTS
            ?.split(',')
            .map((root) => root.trim())
            .filter(Boolean);

        const roots = configuredRoots?.length ? configuredRoots : FlywayMigration.DEFAULT_CLASSPATH_ROOTS;
        const absoluteRoots = roots.map((root) => resolve(cwd, root));

        return absoluteRoots.filter((root) => existsSync(root));
    }

    private static collectDirectories(baseDirectory: string): string[] {
        const directories: string[] = [];
        const stack = [baseDirectory];

        while (stack.length > 0) {
            const currentDirectory = stack.pop();

            if (!currentDirectory) {
                continue;
            }

            directories.push(currentDirectory);

            const entries = readdirSync(currentDirectory, {withFileTypes: true});

            for (const entry of entries) {
                if (entry.isDirectory()) {
                    stack.push(resolve(currentDirectory, entry.name));
                }
            }
        }

        return directories;
    }

    private static matchesPattern(target: string, pattern: string): boolean {
        if (pattern.startsWith('**/')) {
            const suffix = pattern.slice(3);
            return target.endsWith(suffix);
        }

        return target === pattern || target.endsWith(`/${pattern}`);
    }

    private static normalizePattern(value: string): string {
        return value.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
    }
}

export namespace FlywayMigration {

    export type Options = {
        config?: FlywayConfig;
        commandConfig?: FlywayOptionalConfig;
        executionOptions?: ExecutionOptions;
        debug?: boolean;
    };

    export type BuildConfigValues = {
        url: string;
        user: string;
        password?: string;
        defaultSchema?: string;
        migrationLocations: string[];
        table?: string;
        advanced?: NonNullable<FlywayConfig['advanced']>;
    };

    export type MigrateResponse = Awaited<ReturnType<Flyway['migrate']>>;
    export type InfoResponse = Awaited<ReturnType<Flyway['info']>>;
    export type ValidateResponse = Awaited<ReturnType<Flyway['validate']>>;
    export type CleanResponse = Awaited<ReturnType<Flyway['clean']>>;
    export type BaselineResponse = Awaited<ReturnType<Flyway['baseline']>>;
    export type RepairResponse = Awaited<ReturnType<Flyway['repair']>>;
}
