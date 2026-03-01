import * as https from 'https';
import {Module} from '@nestjs/common';
import {CqrsModule} from '@nestjs/cqrs';
import {NATS_URL, NatsClientService} from '@shared/nats';
import {CaStore, CaStoreFactory, ClientCertStore, ClientCertStoreFactory} from '@shared/security/component/cert';
import {PrivateKeyStore, PrivateKeyStoreFactory} from '@shared/security/component/key';
import {
    FspiopAxios,
    FspiopAxiosParams,
    FspiopResponsePublisher,
    FspiopResponseSubscriber,
    FspiopSettings,
    FspiopSigningInterceptor,
} from '@shared/fspiop';
import {DoLookupHandler, DoQuotingHandler, DoTransferHandler} from './command';

const CommandHandlers = [DoLookupHandler, DoQuotingHandler, DoTransferHandler];

@Module({
    imports: [CqrsModule],
    providers: [
        // ── NATS ──────────────────────────────────────────────────────────────
        // Consumer owns the URL source — swap useFactory to read from Vault,
        // a config service, or any other source without touching shared code.
        {
            provide: NATS_URL,
            useFactory: (): string => process.env['NATS_URL'] ?? 'nats://localhost:4222',
        },
        NatsClientService,
        FspiopResponsePublisher,
        FspiopResponseSubscriber,

        // ── FSPIOP settings ───────────────────────────────────────────────────
        {
            provide: FspiopSettings,
            useFactory: (): FspiopSettings => new FspiopSettings(
                process.env['FSPIOP_SWITCH_BASE_URL'] ?? '',
                process.env['FSPIOP_SWITCH_ID']       ?? '',
                process.env['FSPIOP_SIGN_JWS']        === 'true',
                process.env['FSPIOP_VERIFY_JWS']      === 'true',
                process.env['FSPIOP_MUTUAL_TLS']      === 'true',
            ),
        },

        // ── Private key store ─────────────────────────────────────────────────
        {
            provide: PrivateKeyStore,
            useFactory: (): PrivateKeyStore =>
                PrivateKeyStoreFactory.create(process.env['PRIVATE_KEY_STORE_FACTORY'] ?? 'env'),
        },

        // ── CA cert store ─────────────────────────────────────────────────────
        {
            provide: CaStore,
            useFactory: (): CaStore =>
                CaStoreFactory.create(process.env['CA_CERT_STORE_FACTORY'] ?? 'env'),
        },

        // ── Client cert store ─────────────────────────────────────────────────
        {
            provide: ClientCertStore,
            useFactory: (): ClientCertStore =>
                ClientCertStoreFactory.create(process.env['CLIENT_CERT_STORE_FACTORY'] ?? 'env'),
        },

        // ── FspiopAxios ───────────────────────────────────────────────────────
        {
            provide: FspiopAxios,
            useFactory: (
                settings: FspiopSettings,
                privateKeyStore: PrivateKeyStore,
                caStore: CaStore,
                clientCertStore: ClientCertStore,
            ): FspiopAxios => {
                const params: FspiopAxiosParams = {
                    socketTimeoutMs:     parseInt(process.env['FSPIOP_SOCKET_TIMEOUT_MS']     ?? '30000'),
                    connectionTimeoutMs: parseInt(process.env['FSPIOP_CONNECTION_TIMEOUT_MS'] ?? '5000'),
                };

                const interceptors = settings.signJws
                    ? [new FspiopSigningInterceptor(privateKeyStore).build()]
                    : [];

                const httpsAgent = settings.mutualTls
                    ? new https.Agent({
                        ca:   caStore.toBuffer(),
                        cert: clientCertStore.get()?.certBuffer(),
                        key:  clientCertStore.get()?.keyBuffer(),
                        timeout: params.connectionTimeoutMs,
                    })
                    : undefined;

                return new FspiopAxios(settings, params, interceptors, {}, httpsAgent);
            },
            inject: [FspiopSettings, PrivateKeyStore, CaStore, ClientCertStore],
        },

        ...CommandHandlers,
    ],
    exports: [CqrsModule],
})
export class OutboundDomainModule {}
