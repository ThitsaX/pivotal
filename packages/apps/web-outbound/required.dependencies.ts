import {ConfigService} from '@nestjs/config';
import {FspiopAxiosParams, FspiopSettings} from '@shared/fspiop';
import {
    CaStore,
    ClientCertStore,
    PrivateKeyStore,
    PublicKeyStore,
} from '@shared/security';
import type {WebOutboundModule} from './web-outbound.module';

export class WebOutboundDependencies implements WebOutboundModule.RequiredDependencies {

    private static readonly DEFAULT_NATS_URL = 'nats://localhost:4222';
    private static readonly DEFAULT_SWITCH_BASE_URL = 'http://localhost:4000';
    private static readonly DEFAULT_SWITCH_ID = 'switch';
    private static readonly DEFAULT_SIGN_JWS = false;
    private static readonly DEFAULT_VERIFY_JWS = false;
    private static readonly DEFAULT_MUTUAL_TLS = false;

    private readonly outboundPublicKeyStore = new PublicKeyStore();
    private readonly outboundPrivateKeyStore = new PrivateKeyStore();
    private readonly outboundCaStore = new CaStore();
    private readonly outboundClientCertStore = new ClientCertStore();

    constructor(private readonly configService: ConfigService = new ConfigService()) {
    }

    natsUrl(): string {
        return this.readString('NATS_URL', WebOutboundDependencies.DEFAULT_NATS_URL);
    }

    fspiopSettings(): FspiopSettings {
        return new FspiopSettings(
            this.readString('FSPIOP_SWITCH_BASE_URL', WebOutboundDependencies.DEFAULT_SWITCH_BASE_URL),
            this.readString('FSPIOP_SWITCH_ID', WebOutboundDependencies.DEFAULT_SWITCH_ID),
            this.readBoolean('FSPIOP_SIGN_JWS', WebOutboundDependencies.DEFAULT_SIGN_JWS),
            this.readBoolean('FSPIOP_VERIFY_JWS', WebOutboundDependencies.DEFAULT_VERIFY_JWS),
            this.readBoolean('FSPIOP_MUTUAL_TLS', WebOutboundDependencies.DEFAULT_MUTUAL_TLS),
        );
    }

    fspiopAxiosParams(): FspiopAxiosParams {
        const socketTimeoutMs = this.readPositiveInteger('FSPIOP_SOCKET_TIMEOUT_MS');
        const connectionTimeoutMs = this.readPositiveInteger('FSPIOP_CONNECTION_TIMEOUT_MS');

        return {
            socketTimeoutMs,
            connectionTimeoutMs,
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
