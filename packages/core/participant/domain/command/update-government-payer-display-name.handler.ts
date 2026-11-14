// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {PivotalException} from '@shared/foundation/exception/pivotal-exception';
import {DbTarget} from '@shared/typeorm';
import {ParticipantErrorCode, participantError} from '../error/participant-errors';
import {ParticipantRepository} from '../repository';
import {UpdateGovernmentPayerDisplayNameCommand} from './update-government-payer-display-name.command';

/**
 * Stores the name a DFSP shows as the payer on government-to-person transfers when the sender
 * left that name blank.
 *
 * The value is per deployment and is not known at onboard time. Leaving it unset on the entity
 * during onboarding keeps a name an operator already stored. This command is the only write that
 * sets the column, and it sets null deliberately when the operator clears it.
 */
@CommandHandler(UpdateGovernmentPayerDisplayNameCommand)
export class UpdateGovernmentPayerDisplayNameHandler
    implements ICommandHandler<
        UpdateGovernmentPayerDisplayNameCommand,
        UpdateGovernmentPayerDisplayNameCommand.Output
    > {

    private static readonly MAX_DISPLAY_NAME_LENGTH = 128;

    constructor(
        @Inject(ParticipantRepository)
        private readonly repository: ParticipantRepository,
    ) {
    }

    async execute(
        command: UpdateGovernmentPayerDisplayNameCommand,
    ): Promise<UpdateGovernmentPayerDisplayNameCommand.Output> {
        const fspId = command.input.fspId.trim();
        const displayName = UpdateGovernmentPayerDisplayNameHandler.normalizeDisplayName(
            command.input.displayName,
        );
        const participant = fspId.length === 0
            ? null
            : await this.repository.findByName(fspId, DbTarget.Write);

        if (participant == null) {
            const error = participantError(ParticipantErrorCode.UNKNOWN_PARTICIPANT);
            throw new PivotalException(error.code, error.message);
        }

        participant.governmentPayerDisplayName = displayName;
        const saved = await this.repository.save(participant);

        return new UpdateGovernmentPayerDisplayNameCommand.Output(
            saved.name,
            saved.governmentPayerDisplayName ?? null,
        );
    }

    private static normalizeDisplayName(displayName: string | null): string | null {
        if (displayName == null) {
            return null;
        }

        const trimmed = displayName.trim();
        if (trimmed.length === 0) {
            return null;
        }

        if (trimmed.length > UpdateGovernmentPayerDisplayNameHandler.MAX_DISPLAY_NAME_LENGTH) {
            const error = participantError(ParticipantErrorCode.GOVERNMENT_PAYER_DISPLAY_NAME_TOO_LONG);
            throw new PivotalException(error.code, error.message);
        }

        return trimmed;
    }
}
