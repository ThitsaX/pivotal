// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {PivotalException} from '@shared/foundation/exception/pivotal-exception';
import {PublicKey} from '@shared/security';
import {DbTarget} from '@shared/typeorm';
import {ParticipantRepository} from '../repository';
import {UpdateAccessKeyCommand} from './update-access-key.command';

@CommandHandler(UpdateAccessKeyCommand)
export class UpdateAccessKeyHandler
    implements ICommandHandler<UpdateAccessKeyCommand, UpdateAccessKeyCommand.Output> {

    private static readonly HUB_PARTICIPANT_NAME = 'hub';

    constructor(
        @Inject(ParticipantRepository)
        private readonly repository: ParticipantRepository,
    ) {
    }

    async execute(command: UpdateAccessKeyCommand): Promise<UpdateAccessKeyCommand.Output> {
        const name = command.input.name.trim();
        const accessPublicKey = command.input.accessPublicKey.trim();

        if (name.toLowerCase() === UpdateAccessKeyHandler.HUB_PARTICIPANT_NAME) {
            throw new PivotalException(
                'PARTICIPANT_ACCESS_KEY_UPDATE_FORBIDDEN',
                'Hub participant access key cannot be updated.',
            );
        }

        UpdateAccessKeyHandler.assertValidAccessPublicKey(accessPublicKey);

        const participant = await this.repository.findByName(name, DbTarget.Write);

        if (participant == null) {
            throw new PivotalException('PARTICIPANT_NOT_FOUND', `Participant not found for name: ${name}`);
        }

        participant.accessPublicKey = accessPublicKey;

        const saved = await this.repository.save(participant);

        return new UpdateAccessKeyCommand.Output(saved.id);
    }

    private static assertValidAccessPublicKey(accessPublicKey: string): void {
        if (accessPublicKey.length === 0) {
            throw new PivotalException('INVALID_ACCESS_PUBLIC_KEY', 'Access public key is required.');
        }

        try {
            PublicKey.fromBuffer(Buffer.from(accessPublicKey, 'utf8'));
        } catch {
            throw new PivotalException(
                'INVALID_ACCESS_PUBLIC_KEY',
                'Access public key must be a structurally valid PEM public key.',
            );
        }
    }
}
