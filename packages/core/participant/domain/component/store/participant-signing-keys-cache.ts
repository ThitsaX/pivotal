// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit} from '@nestjs/common';
import {ParticipantRepository} from '../../repository';

@Injectable()
export class ParticipantSigningKeysCache implements OnModuleInit, OnModuleDestroy {

    private static readonly REFRESH_INTERVAL_SECONDS_ENV_NAME = 'PARTICIPANT_KEY_STORE_REFRESH_INTERVAL_SECONDS';

    private static readonly DEFAULT_REFRESH_INTERVAL_SECONDS = 5;

    private readonly logger = new Logger(ParticipantSigningKeysCache.name);

    private readonly refreshIntervalMs: number;

    private publicKeysByFspId = new Map<string, string>();

    private privateKeysByFspId = new Map<string, string>();

    private accessPublicKeysByFspId = new Map<string, string>();

    private refreshTimer: NodeJS.Timeout | undefined;

    private isRefreshing = false;

    constructor(
        @Inject(ParticipantRepository)
        private readonly participantRepository: ParticipantRepository,
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
            const participants = await this.participantRepository.findAll();
            const nextPublicKeysByFspId = new Map<string, string>();
            const nextPrivateKeysByFspId = new Map<string, string>();
            const nextAccessPublicKeysByFspId = new Map<string, string>();

            for (const participant of participants) {
                const fspId = participant.name.trim();

                if (fspId.length === 0) {
                    continue;
                }

                const publicKeyPem = ParticipantSigningKeysCache.normalizePem(participant.jwsPublicKey);
                const privateKeyPem = ParticipantSigningKeysCache.normalizePem(participant.jwsPrivateKey);
                const accessPublicKeyPem = ParticipantSigningKeysCache.normalizePem(participant.accessPublicKey);

                if (publicKeyPem != null) {
                    nextPublicKeysByFspId.set(fspId, publicKeyPem);
                }

                if (privateKeyPem != null) {
                    nextPrivateKeysByFspId.set(fspId, privateKeyPem);
                }

                if (accessPublicKeyPem != null) {
                    nextAccessPublicKeysByFspId.set(fspId, accessPublicKeyPem);
                }
            }

            this.publicKeysByFspId = nextPublicKeysByFspId;
            this.privateKeysByFspId = nextPrivateKeysByFspId;
            this.accessPublicKeysByFspId = nextAccessPublicKeysByFspId;
        } finally {
            this.isRefreshing = false;
        }
    }
}
