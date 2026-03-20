import {ConfigService} from '@nestjs/config';
import {LegacySettings} from '@core/legacy/domain';
import {
    FspiopAxiosParams,
    FspiopJwsPrivateKeyStore,
    FspiopJwsPublicKeyStore,
    FspiopMtlsCaStore,
    FspiopMtlsClientCertStore,
    FspiopSettings,
} from '@shared/fspiop';
import {
    CaStore,
    ClientCertStore,
    PrivateKeyStore,
    PublicKeyStore,
} from '@shared/security';
import type {WebLegacyModule} from './web-legacy.module';

export class WebLegacyDependencies implements WebLegacyModule.RequiredDependencies {

    private static readonly DEFAULT_NATS_URL = 'nats://localhost:4222';
    private static readonly DEFAULT_REDIS_URL = 'redis://localhost:6379';
    private static readonly DEFAULT_REDIS_TTL_MS = 300000;
    private static readonly DEFAULT_PARTIES_URL = 'http://localhost:5003';
    private static readonly DEFAULT_QUOTES_URL = 'http://localhost:5003';
    private static readonly DEFAULT_TRANSFERS_URL = 'http://localhost:5003';
    private static readonly DEFAULT_SWITCH_ID = 'switch';
    private static readonly DEFAULT_USE_JWS = false;
    private static readonly DEFAULT_USE_MUTUAL_TLS = false;
    private static readonly DEFAULT_VERIFY_SERVER_CERTIFICATE = true;
    private static readonly DEFAULT_VERIFY_DOMAIN = true;

    private readonly outboundPublicKeyStore: PublicKeyStore;
    private readonly outboundPrivateKeyStore: PrivateKeyStore;
    private readonly outboundCaStore: CaStore;
    private readonly outboundClientCertStore: ClientCertStore;

    constructor(private readonly configService: ConfigService = new ConfigService()) {
        this.outboundPublicKeyStore = new FspiopJwsPublicKeyStore().load();
        this.outboundPrivateKeyStore = new FspiopJwsPrivateKeyStore().load();
        this.outboundCaStore = new FspiopMtlsCaStore().load();
        this.outboundClientCertStore = new FspiopMtlsClientCertStore().load();
    }

    natsUrl(): string {
        return this.readString('NATS_URL', WebLegacyDependencies.DEFAULT_NATS_URL);
    }

    legacySettings(): LegacySettings {
        return new LegacySettings(
            this.readString('REDIS_URL', WebLegacyDependencies.DEFAULT_REDIS_URL),
            this.readPositiveInteger('REDIS_TTL_MS') ?? WebLegacyDependencies.DEFAULT_REDIS_TTL_MS,
        );
    }

    fspiopSettings(): FspiopSettings {
        return new FspiopSettings(
            this.readString('FSPIOP_SWITCH_ID', WebLegacyDependencies.DEFAULT_SWITCH_ID),
            this.readString('FSPIOP_PARTIES_URL', WebLegacyDependencies.DEFAULT_PARTIES_URL),
            this.readString('FSPIOP_QUOTES_URL', WebLegacyDependencies.DEFAULT_QUOTES_URL),
            this.readString('FSPIOP_TRANSFERS_URL', WebLegacyDependencies.DEFAULT_TRANSFERS_URL),
            this.readBoolean('FSPIOP_USE_JWS', WebLegacyDependencies.DEFAULT_USE_JWS),
            this.readBoolean('FSPIOP_USE_MUTUAL_TLS', WebLegacyDependencies.DEFAULT_USE_MUTUAL_TLS),
        );
    }

    fspiopAxiosParams(): FspiopAxiosParams {
        const socketTimeoutMs = this.readPositiveInteger('FSPIOP_SOCKET_TIMEOUT_MS');
        const connectionTimeoutMs = this.readPositiveInteger('FSPIOP_CONNECTION_TIMEOUT_MS');
        const verifyServerCertificate = this.readBoolean(
            'FSPIOP_TLS_VERIFY_SERVER_CERT',
            WebLegacyDependencies.DEFAULT_VERIFY_SERVER_CERTIFICATE,
        );
        const verifyDomain = this.readBoolean(
            'FSPIOP_TLS_VERIFY_DOMAIN',
            WebLegacyDependencies.DEFAULT_VERIFY_DOMAIN,
        );

        return {
            socketTimeoutMs,
            connectionTimeoutMs,
            verifyServerCertificate,
            verifyDomain,
        };
    }

    publicKeyStore(): PublicKeyStore {
        return this.outboundPublicKeyStore;
    }

    privateKeyStore(): PrivateKeyStore {
        return this.outboundPrivateKeyStore;
    }

    caStore(): CaStore {
        return this.outboundCaStore;
    }

    clientCertStore(): ClientCertStore {
        return this.outboundClientCertStore;
    }

    private readString(name: string, fallback: string): string {
        return this.configService.get<string>(name) ?? fallback;
    }

    private readBoolean(name: string, fallback: boolean): boolean {
        const value = this.configService.get<string>(name);
        if (value == null) {
            return fallback;
        }

        const normalized = value.trim().toLowerCase();
        if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
            return true;
        }
        if (normalized === 'false' || normalized === '0' || normalized === 'no') {
            return false;
        }

        return fallback;
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
