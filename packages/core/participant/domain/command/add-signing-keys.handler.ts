// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {FspiopVerifyMode} from '@shared/fspiop';
import {DbTarget} from '@shared/typeorm';
import {ParticipantKey, ParticipantKeyRole} from '../model';
import {ParticipantKeyRepository} from '../repository';
import {AddSigningKeysCommand} from './add-signing-keys.command';

/**
 * Registers JWS keys for a participant, into `participant_key`.
 *
 * Writes there and nowhere else. The `jws_*` columns on `participant` are vestigial — one value in
 * two stores under a non-transactional double write is exactly the shape settled decision 17 rules
 * out.
 *
 * Registering a key does **not** enable anything. `jws_sign_enabled` and `jws_verify_mode` are
 * preserved on an existing row and left at their defaults on a new one, so keys can be provisioned
 * well ahead of the cutover and the switch stays a separate, deliberate act.
 */
@CommandHandler(AddSigningKeysCommand)
export class AddSigningKeysHandler
    implements ICommandHandler<AddSigningKeysCommand, AddSigningKeysCommand.Output> {

    constructor(
        @Inject(ParticipantKeyRepository)
        private readonly repository: ParticipantKeyRepository,
    ) {
    }

    async execute(command: AddSigningKeysCommand): Promise<AddSigningKeysCommand.Output> {

        const fspId = command.input.name;
        const existing = await this.repository.findByFspId(fspId, DbTarget.Write);

        const entity = existing ?? new ParticipantKey();

        entity.fspId = fspId;
        entity.jwsPublicKey = command.input.jwsPublicKey;
        entity.jwsPrivateKey = command.input.jwsPrivateKey;

        // An existing row keeps its role: an operator may have classified it deliberately, and a
        // key update is not a reclassification. Only a new row infers one, from whether a private
        // key is held — with it Pivotal can sign as this participant ('self'), without it the row
        // exists only to verify them ('peer').
        entity.role = existing?.role
            ?? (AddSigningKeysHandler.hasValue(command.input.jwsPrivateKey)
                ? ParticipantKeyRole.Self
                : ParticipantKeyRole.Peer);

        entity.jwsSignEnabled = existing?.jwsSignEnabled ?? false;
        entity.jwsVerifyMode = existing?.jwsVerifyMode ?? FspiopVerifyMode.Off;

        const saved = await this.repository.save(entity);

        return new AddSigningKeysCommand.Output(saved.id);
    }

    private static hasValue(value: string | null | undefined): boolean {
        return value != null && value.trim().length > 0;
    }
}
