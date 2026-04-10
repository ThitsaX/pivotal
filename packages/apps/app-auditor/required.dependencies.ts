import {ConfigService} from '@nestjs/config';
import type {AuditConsumerModule} from '@core/audit/consumer';
import {TypeOrmSettings} from '@shared/typeorm';

export class AuditConsumerDependencies implements AuditConsumerModule.RequiredDependencies {

    private static readonly DEFAULT_NATS_URL = 'nats://localhost:4222';
    private static readonly DEFAULT_DB_HOST = 'localhost';
    private static readonly DEFAULT_DB_PORT = 3306;
    private static readonly DEFAULT_DB_USERNAME = 'root';
    private static readonly DEFAULT_DB_PASSWORD = 'mysql';
    private static readonly DEFAULT_DB_NAME = 'pivotal';

    constructor(private readonly configService: ConfigService = new ConfigService()) {}

    natsUrl(): string {
        return this.readValue('NATS_URL', AuditConsumerDependencies.DEFAULT_NATS_URL);
    }

    writeTypeOrmSettings(): TypeOrmSettings {
        return new TypeOrmSettings(
            this.readValue('DB_WRITE_HOST', AuditConsumerDependencies.DEFAULT_DB_HOST),
            this.readPort('DB_WRITE_PORT'),
            this.readValue('DB_WRITE_USERNAME', AuditConsumerDependencies.DEFAULT_DB_USERNAME),
            this.readValue('DB_WRITE_PASSWORD', AuditConsumerDependencies.DEFAULT_DB_PASSWORD),
            this.readValue('DB_WRITE_NAME', AuditConsumerDependencies.DEFAULT_DB_NAME),
        );
    }

    readTypeOrmSettings(): TypeOrmSettings {
        return new TypeOrmSettings(
            this.readValue('DB_READ_HOST', this.readValue('DB_WRITE_HOST', AuditConsumerDependencies.DEFAULT_DB_HOST)),
            this.readPort('DB_READ_PORT', this.readPort('DB_WRITE_PORT')),
            this.readValue('DB_READ_USERNAME', this.readValue('DB_WRITE_USERNAME', AuditConsumerDependencies.DEFAULT_DB_USERNAME)),
            this.readValue('DB_READ_PASSWORD', this.readValue('DB_WRITE_PASSWORD', AuditConsumerDependencies.DEFAULT_DB_PASSWORD)),
            this.readValue('DB_READ_NAME', this.readValue('DB_WRITE_NAME', AuditConsumerDependencies.DEFAULT_DB_NAME)),
        );
    }

    private readValue(name: string, fallback: string): string {
        return this.configService.get<string>(name) ?? fallback;
    }

    private readPort(name: string, fallback = AuditConsumerDependencies.DEFAULT_DB_PORT): number {
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
