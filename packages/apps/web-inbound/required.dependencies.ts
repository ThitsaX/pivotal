import {ConfigService} from '@nestjs/config';
import {FspiopSettings} from '@shared/fspiop';
import {
    CaStore,
    CaStoreFactory,
    ClientCertStore,
    ClientCertStoreFactory,
    PrivateKeyStore,
    PrivateKeyStoreFactory,
    PublicKeyStore,
    PublicKeyStoreFactory,
} from '@shared/security';
import type {WebInboundModule} from './web-inbound.module';

export class WebInboundDependencies implements WebInboundModule.RequiredDependencies {

    private static readonly DEFAULT_NATS_URL = 'nats://localhost:4222';
    private static readonly DEFAULT_SWITCH_BASE_URL = 'http://localhost:4000';
    private static readonly DEFAULT_SWITCH_ID = 'switch';
    private static readonly DEFAULT_USE_JWS = false;
    private static readonly DEFAULT_USE_MUTUAL_TLS = false;
    private static readonly DEFAULT_PUBLIC_KEY_STORE_FACTORY = 'env';
    private static readonly DEFAULT_PRIVATE_KEY_STORE_FACTORY = 'env';
    private static readonly DEFAULT_CA_STORE_FACTORY = 'env';
    private static readonly DEFAULT_CLIENT_CERT_STORE_FACTORY = 'env';

    private readonly inboundPublicKeyStore: PublicKeyStore;
    private readonly inboundPrivateKeyStore: PrivateKeyStore;
    private readonly inboundCaStore: CaStore;
    private readonly inboundClientCertStore: ClientCertStore;

    constructor(private readonly configService: ConfigService = new ConfigService()) {
        this.inboundPublicKeyStore = PublicKeyStoreFactory.create(
            this.readString('PUBLIC_KEY_STORE_FACTORY', WebInboundDependencies.DEFAULT_PUBLIC_KEY_STORE_FACTORY),
        );
        this.inboundPrivateKeyStore = PrivateKeyStoreFactory.create(
            this.readString('PRIVATE_KEY_STORE_FACTORY', WebInboundDependencies.DEFAULT_PRIVATE_KEY_STORE_FACTORY),
        );
        this.inboundCaStore = CaStoreFactory.create(
            this.readString('CA_CERT_STORE_FACTORY', WebInboundDependencies.DEFAULT_CA_STORE_FACTORY),
        );
        this.inboundClientCertStore = ClientCertStoreFactory.create(
            this.readString('CLIENT_CERT_STORE_FACTORY', WebInboundDependencies.DEFAULT_CLIENT_CERT_STORE_FACTORY),
        );
    }

    natsUrl(): string {
        return this.readString('NATS_URL', WebInboundDependencies.DEFAULT_NATS_URL);
    }

    fspiopSettings(): FspiopSettings {
        return new FspiopSettings(
            this.readString('FSPIOP_SWITCH_BASE_URL', WebInboundDependencies.DEFAULT_SWITCH_BASE_URL),
            this.readString('FSPIOP_SWITCH_ID', WebInboundDependencies.DEFAULT_SWITCH_ID),
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
