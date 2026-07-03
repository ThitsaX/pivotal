import {ConfigService} from '@nestjs/config';
import type {AuditConsumerModule} from '@core/audit/consumer';
import {TypeOrmSettings} from '@shared/typeorm';

export class AuditConsumerSettings implements AuditConsumerModule.RequiredSettings {

    constructor(private readonly configService: ConfigService = new ConfigService()) {}

    natsUrl(): string {
        return this.readRequiredValue('NATS_URL');
    }

    writeTypeOrmSettings(): TypeOrmSettings {
        return new TypeOrmSettings(
            this.readRequiredValue('DB_WRITE_HOST'),
            this.readPort('DB_WRITE_PORT'),
            this.readRequiredValue('DB_WRITE_USERNAME'),
            this.readRequiredValue('DB_WRITE_PASSWORD'),
            this.readRequiredValue('DB_WRITE_NAME'),
        );
    }

    readTypeOrmSettings(): TypeOrmSettings {
        return new TypeOrmSettings(
            this.readRequiredValue('DB_READ_HOST'),
            this.readPort('DB_READ_PORT'),
            this.readRequiredValue('DB_READ_USERNAME'),
            this.readRequiredValue('DB_READ_PASSWORD'),
            this.readRequiredValue('DB_READ_NAME'),
        );
    }

    redisUrl(): string {
        return this.readRequiredValue('REDIS_URL');
    }

    transactionRollupIntervalSeconds(): number {
        return this.readPositiveIntWithDefault('TRANSACTION_ROLLUP_INTERVAL_SECONDS', 300);
    }

    private readRequiredValue(name: string): string {
        const value = this.configService.get<string>(name);

        if (value == null || value.trim().length === 0) {
            throw new Error(`Missing required environment variable: ${name}`);
        }

        return value;
    }

    private readPort(name: string): number {
        const value = this.readRequiredValue(name);

        const parsed = Number(value);
        if (!Number.isInteger(parsed) || parsed <= 0) {
            throw new Error(`Invalid environment variable ${name}: expected a positive integer.`);
        }

        return parsed;
    }

    private readPositiveIntWithDefault(name: string, fallback: number): number {
        const value = this.configService.get<string>(name);

        if (value == null || value.trim().length === 0) {
            return fallback;
        }

        const parsed = Number(value);
        if (!Number.isInteger(parsed) || parsed <= 0) {
            throw new Error(`Invalid environment variable ${name}: expected a positive integer.`);
        }

        return parsed;
    }
}
