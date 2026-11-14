// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Inject} from '@nestjs/common';
import {IQueryHandler, QueryHandler} from '@nestjs/cqrs';
import {PivotalException} from '@shared/foundation/exception/pivotal-exception';
import {DbTarget} from '@shared/typeorm';
import {ParticipantErrorCode, participantError} from '../error/participant-errors';
import {ParticipantRepository} from '../repository';
import {GetGovernmentPayerDisplayNameQuery} from './get-government-payer-display-name.query';

/**
 * The name currently stored for a DFSP, read from the writer.
 *
 * An operator sets this and then confirms it. A replica that has not caught up would show the
 * previous name, and the next save would be based on a value the operator never saw.
 */
@QueryHandler(GetGovernmentPayerDisplayNameQuery)
export class GetGovernmentPayerDisplayNameHandler
    implements IQueryHandler<GetGovernmentPayerDisplayNameQuery, GetGovernmentPayerDisplayNameQuery.Output> {

    constructor(
        @Inject(ParticipantRepository)
        private readonly repository: ParticipantRepository,
    ) {
    }

    async execute(query: GetGovernmentPayerDisplayNameQuery): Promise<GetGovernmentPayerDisplayNameQuery.Output> {
        const fspId = query.input.fspId.trim();
        const participant = fspId.length === 0
            ? null
            : await this.repository.findByName(fspId, DbTarget.Write);

        if (participant == null) {
            const error = participantError(ParticipantErrorCode.UNKNOWN_PARTICIPANT);
            throw new PivotalException(error.code, error.message);
        }

        return new GetGovernmentPayerDisplayNameQuery.Output(
            participant.name,
            participant.governmentPayerDisplayName ?? null,
        );
    }
}
