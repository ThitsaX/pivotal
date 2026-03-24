import {ConfigService} from '@nestjs/config';
import {CentralLedgerAxios, CentralLedgerAxiosParams} from '@shared/central-ledger';
import {TypeOrmSettings} from '@shared/typeorm';
import type {WebPivotalModule} from './web-pivotal.module';

export class WebPivotalDependencies implements WebPivotalModule.RequiredDependencies {

    private static readonly DEFAULT_CENTRAL_LEDGER_URL = 'http://localhost:3001';
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
            this.readValue('DB_WRITE_HOST', WebPivotalDependencies.DEFAULT_DB_HOST),
            this.readPort('DB_WRITE_PORT'),
            this.readValue('DB_WRITE_USERNAME', WebPivotalDependencies.DEFAULT_DB_USERNAME),
            this.readValue('DB_WRITE_PASSWORD', WebPivotalDependencies.DEFAULT_DB_PASSWORD),
            this.readValue('DB_WRITE_NAME', WebPivotalDependencies.DEFAULT_DB_NAME),
            this.readValue('DB_WRITE_SCHEMA', WebPivotalDependencies.DEFAULT_DB_SCHEMA),
        );
    }

    readTypeOrmSettings(): TypeOrmSettings {
        return new TypeOrmSettings(
            this.readValue('DB_READ_HOST', this.readValue('DB_WRITE_HOST', WebPivotalDependencies.DEFAULT_DB_HOST)),
            this.readPort('DB_READ_PORT', this.readPort('DB_WRITE_PORT')),
            this.readValue('DB_READ_USERNAME', this.readValue('DB_WRITE_USERNAME', WebPivotalDependencies.DEFAULT_DB_USERNAME)),
            this.readValue('DB_READ_PASSWORD', this.readValue('DB_WRITE_PASSWORD', WebPivotalDependencies.DEFAULT_DB_PASSWORD)),
            this.readValue('DB_READ_NAME', this.readValue('DB_WRITE_NAME', WebPivotalDependencies.DEFAULT_DB_NAME)),
            this.readValue('DB_READ_SCHEMA', this.readValue('DB_WRITE_SCHEMA', WebPivotalDependencies.DEFAULT_DB_SCHEMA)),
        );
    }

    centralLedgerAxios(): CentralLedgerAxios {
        return new CentralLedgerAxios(
            this.readValue('CENTRAL_LEDGER_URL', WebPivotalDependencies.DEFAULT_CENTRAL_LEDGER_URL),
            this.centralLedgerAxiosParams(),
        );
    }

    private centralLedgerAxiosParams(): CentralLedgerAxiosParams {
        const socketTimeoutMs = this.readPositiveInteger('CENTRAL_LEDGER_SOCKET_TIMEOUT_MS');
        const connectionTimeoutMs = this.readPositiveInteger('CENTRAL_LEDGER_CONNECTION_TIMEOUT_MS');

        return {
            socketTimeoutMs,
            connectionTimeoutMs,
        };
    }

    private readValue(name: string, fallback: string): string {
        return this.configService.get<string>(name) ?? fallback;
    }

    private readPort(name: string, fallback = WebPivotalDependencies.DEFAULT_DB_PORT): number {
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
