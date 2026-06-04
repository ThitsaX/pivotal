import { ConfigService } from '@nestjs/config';
import { OutboundSettings } from '@core/outbound/domain';
import { CentralLedgerAxiosParams } from '@shared/central-ledger';
import { TypeOrmSettings } from '@shared/typeorm/component/typeorm-settings';
import { FspiopAxiosParams, FspiopSettings } from '@shared/fspiop';
import type { WebOutboundModule } from './web-outbound.module';
import { JwtPolicy } from './component';

export class WebOutboundSettings
    implements WebOutboundModule.RequiredSettings {

    constructor(private readonly configService: ConfigService = new ConfigService()) {

    }

    natsUrl(): string {
        return this.readRequiredString('NATS_URL');
    }

    writeTypeOrmSettings(): TypeOrmSettings {
        return new TypeOrmSettings(
            this.readRequiredString('DB_WRITE_HOST'),
            this.readPort('DB_WRITE_PORT'),
            this.readRequiredString('DB_WRITE_USERNAME'),
            this.readRequiredString('DB_WRITE_PASSWORD'),
            this.readRequiredString('DB_WRITE_NAME'),
        );
    }

    readTypeOrmSettings(): TypeOrmSettings {
        return new TypeOrmSettings(
            this.readRequiredString('DB_READ_HOST'),
            this.readPort('DB_READ_PORT'),
            this.readRequiredString('DB_READ_USERNAME'),
            this.readRequiredString('DB_READ_PASSWORD'),
            this.readRequiredString('DB_READ_NAME'),
        );
    }

    outboundSettings(): OutboundSettings {

        const socketTimeoutMs = this.readPositiveInteger('FSPIOP_SOCKET_TIMEOUT_MS');
        const connectionTimeoutMs = this.readPositiveInteger('FSPIOP_CONNECTION_TIMEOUT_MS');
        const verifyServerCertificate = this.readRequiredBoolean('FSPIOP_TLS_VERIFY_SERVER_CERT');
        const verifyDomain = this.readRequiredBoolean('FSPIOP_TLS_VERIFY_DOMAIN');
        const prefixOracleAxiosParams = {
            socketTimeoutMs: this.readPositiveInteger('PREFIX_ORACLE_SOCKET_TIMEOUT_MS'),
            connectionTimeoutMs: this.readPositiveInteger('PREFIX_ORACLE_CONNECTION_TIMEOUT_MS'),
        };

        const fspiopAxiosParams: FspiopAxiosParams = {
            socketTimeoutMs,
            connectionTimeoutMs,
            verifyServerCertificate,
            verifyDomain,
        };

        return new OutboundSettings(
            this.readRequiredString('REDIS_URL'),
            this.readRequiredPositiveInteger('REDIS_CACHE_ITEM_TIMEOUT_MS'),
            new FspiopSettings(
                this.readRequiredString('FSPIOP_SWITCH_ID'),
                this.readRequiredString('FSPIOP_PARTIES_URL'),
                this.readRequiredString('FSPIOP_QUOTES_URL'),
                this.readRequiredString('FSPIOP_TRANSFERS_URL'),
                this.readRequiredBoolean('FSPIOP_USE_JWS'),
                this.readRequiredBoolean('FSPIOP_USE_MUTUAL_TLS')
            ),
            fspiopAxiosParams,
            this.readRequiredString('PREFIX_ORACLE_ENDPOINT'),
            prefixOracleAxiosParams,
        );
    }

    jwtPolicy(): JwtPolicy {
        return {
            enabled: this.readOptionalBoolean('ACCESS_JWT_ENABLED') ?? true,
        };
    }

    centralLedgerUrl(): string {
        return this.readRequiredString('CENTRAL_LEDGER_URL');
    }

    centralLedgerAxiosParams(): CentralLedgerAxiosParams {

        const socketTimeoutMs = this.readPositiveInteger('CENTRAL_LEDGER_SOCKET_TIMEOUT_MS');
        const connectionTimeoutMs = this.readPositiveInteger('CENTRAL_LEDGER_CONNECTION_TIMEOUT_MS');

        return {
            socketTimeoutMs,
            connectionTimeoutMs,
        };
    }

    private readRequiredString(name: string): string {
        const value = this.configService.get<string>(name);

        if (value == null || value.trim().length === 0) {
            throw new Error(`Missing required environment variable: ${name}`);
        }

        return value;
    }

    private readRequiredBoolean(name: string): boolean {
        const value = this.readRequiredString(name);

        const normalized = value.trim().toLowerCase();
        if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
            return true;
        }
        if (normalized === 'false' || normalized === '0' || normalized === 'no') {
            return false;
        }

        throw new Error(`Invalid environment variable ${name}: expected a boolean value.`);
    }

    private readPort(name: string): number {
        const value = this.readRequiredString(name);

        const parsed = Number(value);

        if (!Number.isInteger(parsed) || parsed <= 0) {
            throw new Error(`Invalid environment variable ${name}: expected a positive integer.`);
        }

        return parsed;
    }

    private readRequiredPositiveInteger(name: string): number {
        const value = this.readRequiredString(name);
        const parsed = Number(value);

        if (!Number.isInteger(parsed) || parsed <= 0) {
            throw new Error(`Invalid environment variable ${name}: expected a positive integer.`);
        }

        return parsed;
    }

    private readOptionalBoolean(name: string): boolean | undefined {
        const value = this.configService.get<string>(name);
        if (value == null || value.trim().length === 0) {
            return undefined;
        }
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
        if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
        return undefined;
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
