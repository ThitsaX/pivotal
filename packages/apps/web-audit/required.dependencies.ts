import {ConfigService} from '@nestjs/config';
import {TypeOrmSettings} from '@shared/typeorm';
import type {WebAuditModule} from './web-audit.module';

export class WebAuditDependencies implements WebAuditModule.RequiredDependencies {

    private static readonly DEFAULT_DB_HOST = 'localhost';
    private static readonly DEFAULT_DB_PORT = 5432;
    private static readonly DEFAULT_DB_USERNAME = 'postgres';
    private static readonly DEFAULT_DB_PASSWORD = 'postgres';
    private static readonly DEFAULT_DB_NAME = 'pivotal';
    private static readonly DEFAULT_DB_SCHEMA = 'public';

    constructor(private readonly configService: ConfigService = new ConfigService()) {
    }

    writeTypeOrmSettings(): TypeOrmSettings {
        return new TypeOrmSettings(
            this.readValue('DB_WRITE_HOST', WebAuditDependencies.DEFAULT_DB_HOST),
            this.readPort('DB_WRITE_PORT'),
            this.readValue('DB_WRITE_USERNAME', WebAuditDependencies.DEFAULT_DB_USERNAME),
            this.readValue('DB_WRITE_PASSWORD', WebAuditDependencies.DEFAULT_DB_PASSWORD),
            this.readValue('DB_WRITE_NAME', WebAuditDependencies.DEFAULT_DB_NAME),
            this.readValue('DB_WRITE_SCHEMA', WebAuditDependencies.DEFAULT_DB_SCHEMA),
        );
    }

    readTypeOrmSettings(): TypeOrmSettings {
        return new TypeOrmSettings(
            this.readValue('DB_READ_HOST', this.readValue('DB_WRITE_HOST', WebAuditDependencies.DEFAULT_DB_HOST)),
            this.readPort('DB_READ_PORT', this.readPort('DB_WRITE_PORT')),
            this.readValue('DB_READ_USERNAME', this.readValue('DB_WRITE_USERNAME', WebAuditDependencies.DEFAULT_DB_USERNAME)),
            this.readValue('DB_READ_PASSWORD', this.readValue('DB_WRITE_PASSWORD', WebAuditDependencies.DEFAULT_DB_PASSWORD)),
            this.readValue('DB_READ_NAME', this.readValue('DB_WRITE_NAME', WebAuditDependencies.DEFAULT_DB_NAME)),
            this.readValue('DB_READ_SCHEMA', this.readValue('DB_WRITE_SCHEMA', WebAuditDependencies.DEFAULT_DB_SCHEMA)),
        );
    }

    private readValue(name: string, fallback: string): string {
        return this.configService.get<string>(name) ?? fallback;
    }

    private readPort(name: string, fallback = WebAuditDependencies.DEFAULT_DB_PORT): number {
        const value = this.configService.get<string>(name);

        if (!value) {
            return fallback;
        }

        const parsed = Number(value);

        if (!Number.isInteger(parsed) || parsed <= 0) {
            return fallback;
        }

        return parsed;
    }
}
