// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit} from '@nestjs/common';
import {FspiopVerifyMode} from '@shared/fspiop/component/fspiop-verify-mode';
import {ParticipantKeyRepository, ParticipantRepository} from '../../repository';
import {DatabaseJwsPrivateKeySource, JwsPrivateKeySource} from './jws-private-key-source';

@Injectable()
export class ParticipantSigningKeysCache implements OnModuleInit, OnModuleDestroy {

    private static readonly REFRESH_INTERVAL_SECONDS_ENV_NAME = 'PARTICIPANT_KEY_STORE_REFRESH_INTERVAL_SECONDS';

    private static readonly DEFAULT_REFRESH_INTERVAL_SECONDS = 5;

    private readonly logger = new Logger(ParticipantSigningKeysCache.name);

    private readonly refreshIntervalMs: number;

    private publicKeysByFspId = new Map<string, string>();

    private privateKeysByFspId = new Map<string, string>();

    private accessPublicKeysByFspId = new Map<string, string>();

    private signEnabledByFspId = new Map<string, boolean>();

    private verifyModeByFspId = new Map<string, FspiopVerifyMode>();

    private refreshTimer: NodeJS.Timeout | undefined;

    private isRefreshing = false;

    constructor(
        @Inject(ParticipantRepository)
        private readonly participantRepository: ParticipantRepository,
        @Inject(ParticipantKeyRepository)
        private readonly participantKeyRepository: ParticipantKeyRepository,
        /**
         * Where private keys come from. Defaults to the database source so that a deployment which
         * has not chosen a `KEY_PROVIDER` keeps working — but that source is legacy, and the
         * default exists for continuity rather than as a recommendation.
         */
        private readonly privateKeySource: JwsPrivateKeySource = new DatabaseJwsPrivateKeySource(),
    ) {
        this.refreshIntervalMs = ParticipantSigningKeysCache.resolveRefreshIntervalMs();
    }

    private static normalizePem(pem: string | null | undefined): string | undefined {
        if (pem == null || pem.trim().length === 0) {
            return undefined;
        }

        return pem.replace(/\\n/g, '\n');
    }

    private static resolveRefreshIntervalMs(): number {
        const value = process.env[ParticipantSigningKeysCache.REFRESH_INTERVAL_SECONDS_ENV_NAME];

        if (value == null || value.trim().length === 0) {
            return ParticipantSigningKeysCache.DEFAULT_REFRESH_INTERVAL_SECONDS * 1000;
        }

        const parsed = Number(value);

        if (!Number.isInteger(parsed) || parsed <= 0) {
            return ParticipantSigningKeysCache.DEFAULT_REFRESH_INTERVAL_SECONDS * 1000;
        }

        return parsed * 1000;
    }

    async onModuleInit(): Promise<void> {
        this.load();
        await this.refreshParticipantSigningKeys();
    }

    onModuleDestroy(): void {
        if (this.refreshTimer == null) {
            return;
        }

        clearInterval(this.refreshTimer);
        this.refreshTimer = undefined;
    }

    load(): void {
        void this.refreshSafely();

        if (this.refreshTimer != null) {
            return;
        }

        this.refreshTimer = setInterval(() => {
            void this.refreshSafely();
        }, this.refreshIntervalMs);
    }

    getPublicKeyPem(fspId: string): string | undefined {
        return this.publicKeysByFspId.get(fspId);
    }

    getPrivateKeyPem(fspId: string): string | undefined {
        return this.privateKeysByFspId.get(fspId);
    }

    getAccessPublicKeyPem(fspId: string): string | undefined {
        return this.accessPublicKeysByFspId.get(fspId);
    }

    isSignEnabled(fspId: string): boolean {
        return this.signEnabledByFspId.get(fspId) === true;
    }

    getVerifyMode(fspId: string): FspiopVerifyMode | undefined {
        return this.verifyModeByFspId.get(fspId);
    }

    private async refreshSafely(): Promise<void> {
        try {
            await this.refreshParticipantSigningKeys();
        } catch (error) {
            this.logger.error(
                `Failed to refresh participant signing keys: ${(error as Error).message}`,
                (error as Error).stack,
            );
        }
    }

    private async refreshParticipantSigningKeys(): Promise<void> {
        if (this.isRefreshing) {
            return;
        }

        this.isRefreshing = true;

        try {
            const [participants, participantKeys] = await Promise.all([
                this.participantRepository.findAll(),
                this.participantKeyRepository.findAll(),
            ]);

            const nextPublicKeysByFspId = new Map<string, string>();
            const nextAccessPublicKeysByFspId = new Map<string, string>();
            const nextSignEnabledByFspId = new Map<string, boolean>();
            const nextVerifyModeByFspId = new Map<string, FspiopVerifyMode>();

            // accessKey stays on `participant`: it belongs to the DFSP-facing leg, which is a
            // different relationship from FSPIOP JWS and is already live in production.
            for (const participant of participants) {
                const fspId = participant.name.trim();

                if (fspId.length === 0) {
                    continue;
                }

                const accessPublicKeyPem = ParticipantSigningKeysCache.normalizePem(participant.accessPublicKey);

                if (accessPublicKeyPem != null) {
                    nextAccessPublicKeysByFspId.set(fspId, accessPublicKeyPem);
                }
            }

            // JWS material comes from `participant_key`, which can represent peers as well as
            // tenants. Ids are matched verbatim — no case folding — because that is how
            // `fspiop-source` is compared everywhere else.
            for (const participantKey of participantKeys) {
                const fspId = participantKey.fspId.trim();

                if (fspId.length === 0) {
                    continue;
                }

                // Public keys are not secret, so they stay in MySQL where the inbound guard can
                // read them without a Vault round trip. Private keys come from the configured
                // source — see JwsPrivateKeySource.
                const publicKeyPem = ParticipantSigningKeysCache.normalizePem(participantKey.jwsPublicKey);

                if (publicKeyPem != null) {
                    nextPublicKeysByFspId.set(fspId, publicKeyPem);
                }

                nextSignEnabledByFspId.set(fspId, participantKey.jwsSignEnabled === true);
                nextVerifyModeByFspId.set(fspId, FspiopVerifyMode.parse(participantKey.jwsVerifyMode));
            }

            // Resolved last, and outside the loop, so one round trip per tenant happens only after
            // the registry read succeeded. A throw here leaves every map untouched — the caller
            // catches, and the previously loaded keys stay live.
            const nextPrivateKeysByFspId = await this.privateKeySource.resolve(
                participantKeys,
                this.privateKeysByFspId,
            );

            this.publicKeysByFspId = nextPublicKeysByFspId;
            this.privateKeysByFspId = nextPrivateKeysByFspId;
            this.accessPublicKeysByFspId = nextAccessPublicKeysByFspId;
            this.signEnabledByFspId = nextSignEnabledByFspId;
            this.verifyModeByFspId = nextVerifyModeByFspId;
        } finally {
            this.isRefreshing = false;
        }
    }
}
