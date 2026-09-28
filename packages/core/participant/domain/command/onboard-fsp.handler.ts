// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Inject, Logger, Optional} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {CentralLedgerFacade} from '@shared/central-ledger';
import {FspiopVerifyMode} from '@shared/fspiop';
import {DbTarget} from '@shared/typeorm';
import {SigningTenantPublisher} from '../component';
import {JwsKeyProvisioner} from '../component/store';
import {Participant, ParticipantKey, ParticipantKeyRole} from '../model';
import {ParticipantKeyRepository, ParticipantRepository} from '../repository';
import {OnboardFspCommand} from './onboard-fsp.command';

/**
 * Onboards a participant and provisions the signing key it will use towards the Hub.
 *
 * The key is created here rather than supplied, and no private key crosses the API: under the Vault
 * profile it goes straight to Vault, under the HSM profile it never leaves the hardware, and only
 * the legacy database profile hands one back to be stored. That is why the request carries no key
 * fields at all — an operator has nothing to paste, and nothing to lose.
 *
 * Signing is left **off**. A tenant that signs before its public key has reached MCM produces
 * signatures no peer can verify, which surfaces as a Hub rejection rather than as a provisioning
 * problem. trust-manager publishes the key and turns signing on once MCM confirms it.
 */
@CommandHandler(OnboardFspCommand)
export class OnboardFspHandler
    implements ICommandHandler<OnboardFspCommand, OnboardFspCommand.Output> {

    private readonly logger = new Logger(OnboardFspHandler.name);

    constructor(
        @Inject(CentralLedgerFacade)
        private readonly centralLedgerFacade: CentralLedgerFacade,
        @Inject(ParticipantRepository)
        private readonly repository: ParticipantRepository,
        @Inject(ParticipantKeyRepository)
        private readonly participantKeyRepository: ParticipantKeyRepository,
        @Inject(JwsKeyProvisioner)
        private readonly keyProvisioner: JwsKeyProvisioner,
        // Optional so a deployment without NATS still onboards. Announcing is an optimisation:
        // without it trust-manager's periodic reconcile publishes the key instead, a little later.
        // Refusing to onboard because a message bus is absent would be a worse trade.
        @Optional() @Inject(SigningTenantPublisher)
        private readonly signingTenantPublisher?: SigningTenantPublisher,
    ) {
    }

    async execute(command: OnboardFspCommand): Promise<OnboardFspCommand.Output> {
        const {name, currencies, endpoint, accessPublicKey} = command.input;

        await this.centralLedgerFacade.onboardFsp(name, currencies, endpoint);

        const existing = await this.repository.findByName(name, DbTarget.Write);
        const entity = new Participant(name, null, null, accessPublicKey, existing?.id);
        const saved = await this.repository.save(entity);

        await this.provisionSigningKey(name);

        return new OnboardFspCommand.Output(saved.id);
    }

    /**
     * Gives the tenant a signing key and the row that makes it one.
     *
     * Skipped when a key is already held: onboarding is re-runnable — an operator correcting an
     * endpoint should not silently replace a key that peers have already pulled, which would break
     * verification for every one of them until they pull again.
     */
    private async provisionSigningKey(fspId: string): Promise<void> {

        const existing = await this.participantKeyRepository.findByFspId(fspId, DbTarget.Write);

        if (existing?.jwsPublicKey != null && existing.jwsPublicKey.trim().length > 0) {
            this.logger.log(
                `'${fspId}' already holds a signing key; leaving it in place. Rotate deliberately `
                + 'rather than by re-onboarding.',
            );
            return;
        }

        const provisioned = await this.keyProvisioner.provision(fspId);

        const participantKey = existing ?? new ParticipantKey();

        participantKey.fspId = fspId;
        participantKey.role = ParticipantKeyRole.Self;
        participantKey.jwsPublicKey = provisioned.publicKeyPem;

        // Undefined under both modern profiles: the key is in Vault, or inside the HSM. Only the
        // legacy database profile has a private key to store here.
        participantKey.jwsPrivateKey = provisioned.legacyPrivateKeyPem ?? null;

        // Left off until trust-manager has published the public key to MCM and confirmed it. The
        // activation record is cleared with it: this is a key nothing has ever signed with, so any
        // earlier activation of this tenant says nothing about whether this one should be trusted
        // on — and leaving it set would stop the sweep from ever switching signing back on.
        participantKey.jwsSignEnabled = false;
        participantKey.jwsSignActivatedAt = null;
        participantKey.jwsVerifyMode = existing?.jwsVerifyMode ?? FspiopVerifyMode.Off;

        await this.participantKeyRepository.save(participantKey);

        this.logger.log(
            `Provisioned '${fspId}' as a signing tenant. Signing stays off until its public key is `
            + 'published to MCM.',
        );

        await this.signingTenantPublisher?.publish(fspId);
    }
}
