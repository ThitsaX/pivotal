// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Inject, Logger} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {FspiopVerifyMode} from '@shared/fspiop';
import {PivotalException} from '@shared/foundation/exception/pivotal-exception';
import {DbTarget} from '@shared/typeorm';
import {ParticipantKeyRole} from '../model';
import {ParticipantKeyRepository} from '../repository';
import {UpdateJwsPolicyCommand} from './update-jws-policy.command';

/**
 * Moves a participant's JWS switches: whether Pivotal signs as them, and how strictly their
 * inbound signatures are checked.
 *
 * These are operational decisions taken after provisioning, not part of it. Onboarding leaves
 * signing off and trust-manager turns it on once the key reaches MCM; this exists for everything
 * afterwards — suspending a tenant, tightening verification as peers adopt signing, or enabling a
 * tenant whose publication was resolved by hand.
 */
@CommandHandler(UpdateJwsPolicyCommand)
export class UpdateJwsPolicyHandler
    implements ICommandHandler<UpdateJwsPolicyCommand, UpdateJwsPolicyCommand.Output> {

    private readonly logger = new Logger(UpdateJwsPolicyHandler.name);

    constructor(
        @Inject(ParticipantKeyRepository)
        private readonly repository: ParticipantKeyRepository,
    ) {
    }

    async execute(command: UpdateJwsPolicyCommand): Promise<UpdateJwsPolicyCommand.Output> {

        const fspId = command.input.fspId.trim();
        const existing = await this.repository.findByFspId(fspId, DbTarget.Write);

        if (existing == null) {
            throw new PivotalException(
                'PARTICIPANT_KEY_NOT_FOUND',
                `No key record exists for participant '${fspId}'.`,
            );
        }

        if (command.input.jwsSignEnabled === true) {
            // Signing needs a key of our own and a public half peers can verify against. Enabling
            // without either produces signatures nothing can check, which surfaces at the Hub as a
            // rejected transfer rather than as a configuration mistake.
            if (existing.role !== ParticipantKeyRole.Self) {
                throw new PivotalException(
                    'PARTICIPANT_NOT_SIGNING_TENANT',
                    `'${fspId}' is a peer, not a tenant this deployment signs for.`,
                );
            }

            if (existing.jwsPublicKey == null || existing.jwsPublicKey.trim().length === 0) {
                throw new PivotalException(
                    'PARTICIPANT_KEY_MISSING',
                    `'${fspId}' has no signing key. Provision one before enabling signing.`,
                );
            }
        }

        existing.jwsSignEnabled = command.input.jwsSignEnabled ?? existing.jwsSignEnabled;
        existing.jwsVerifyMode = command.input.jwsVerifyMode ?? existing.jwsVerifyMode;

        if (existing.jwsSignEnabled && existing.jwsSignActivatedAt == null) {
            // Records that signing has been on at least once. The key-publish sweep switches on
            // only tenants that have never been activated, so without this a tenant enabled here
            // and suspended later would be switched back on within the hour.
            existing.jwsSignActivatedAt = new Date();
        }

        const saved = await this.repository.save(existing);

        this.logger.log(
            `'${fspId}' JWS policy is now sign=${saved.jwsSignEnabled} `
            + `verify=${saved.jwsVerifyMode}.`,
        );

        // The column is a plain string; parse on the way out so a value written before the enum
        // existed, or edited by hand, surfaces here rather than downstream.
        return new UpdateJwsPolicyCommand.Output(
            saved.fspId,
            saved.jwsSignEnabled,
            FspiopVerifyMode.parse(saved.jwsVerifyMode, FspiopVerifyMode.Off));
    }
}
