import {ConfigService} from '@nestjs/config';
import {
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
import type {WebInboundModule} from './web-inbound.module';

export class WebInboundDependencies implements WebInboundModule.RequiredDependencies {

    private static readonly DEFAULT_NATS_URL = 'nats://localhost:4222';
    private static readonly DEFAULT_PARTIES_URL = 'http://localhost:5003';
    private static readonly DEFAULT_QUOTES_URL = 'http://localhost:5003';
    private static readonly DEFAULT_TRANSFERS_URL = 'http://localhost:5003';
    private static readonly DEFAULT_SWITCH_ID = 'switch';
    private static readonly DEFAULT_USE_JWS = false;
    private static readonly DEFAULT_USE_MUTUAL_TLS = false;

    private readonly inboundPublicKeyStore: PublicKeyStore;
    private readonly inboundPrivateKeyStore: PrivateKeyStore;
    private readonly inboundCaStore: CaStore;
    private readonly inboundClientCertStore: ClientCertStore;

    constructor(private readonly configService: ConfigService = new ConfigService()) {
        this.inboundPublicKeyStore = new FspiopJwsPublicKeyStore().load();
        this.inboundPrivateKeyStore = new FspiopJwsPrivateKeyStore().load();
        this.inboundCaStore = new FspiopMtlsCaStore().load();
        this.inboundClientCertStore = new FspiopMtlsClientCertStore().load();
    }

    natsUrl(): string {
        return this.readString('NATS_URL', WebInboundDependencies.DEFAULT_NATS_URL);
    }

    fspiopSettings(): FspiopSettings {
        return new FspiopSettings(
            this.readString('FSPIOP_SWITCH_ID', WebInboundDependencies.DEFAULT_SWITCH_ID),
            this.readString('FSPIOP_PARTIES_URL', WebInboundDependencies.DEFAULT_PARTIES_URL),
            this.readString('FSPIOP_QUOTES_URL', WebInboundDependencies.DEFAULT_QUOTES_URL),
            this.readString('FSPIOP_TRANSFERS_URL', WebInboundDependencies.DEFAULT_TRANSFERS_URL),
            this.readBoolean('FSPIOP_USE_JWS', WebInboundDependencies.DEFAULT_USE_JWS),
            this.readBoolean('FSPIOP_USE_MUTUAL_TLS', WebInboundDependencies.DEFAULT_USE_MUTUAL_TLS),
        );
    }

    publicKeyStore(): PublicKeyStore {
        return this.inboundPublicKeyStore;
    }

    privateKeyStore(): PrivateKeyStore {
        return this.inboundPrivateKeyStore;
    }

    caStore(): CaStore {
        return this.inboundCaStore;
    }

    clientCertStore(): ClientCertStore {
        return this.inboundClientCertStore;
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
}
