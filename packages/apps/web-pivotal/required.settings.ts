import {ConfigService} from '@nestjs/config';
import {CentralLedgerAxiosParams} from '@shared/central-ledger';
import {TypeOrmSettings} from '@shared/typeorm';
import type {WebPivotalModule} from './web-pivotal.module';

export class WebPivotalSettings implements WebPivotalModule.RequiredSettings {

    constructor(private readonly configService: ConfigService = new ConfigService()) {
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

    centralLedgerUrl(): string {
        return this.readRequiredValue('CENTRAL_LEDGER_URL');
    }

    centralLedgerAxiosParams(): CentralLedgerAxiosParams {
        const socketTimeoutMs = this.readPositiveInteger('CENTRAL_LEDGER_SOCKET_TIMEOUT_MS');
        const connectionTimeoutMs = this.readPositiveInteger('CENTRAL_LEDGER_CONNECTION_TIMEOUT_MS');

        return {
            socketTimeoutMs,
            connectionTimeoutMs,
        };
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

    private readPositiveInteger(name: string): number | undefined {
        const value = this.configService.get<string>(name);

        if (value == null) {
            return undefined;
        }

        const parsed = Number(value);

        if (!Number.isInteger(parsed) || parsed <= 0) {
            return undefined;
        }

        return parsed;
    }
}
