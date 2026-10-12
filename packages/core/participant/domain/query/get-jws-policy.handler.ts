// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Inject} from '@nestjs/common';
import {IQueryHandler, QueryHandler} from '@nestjs/cqrs';
import {FspiopVerifyMode} from '@shared/fspiop';
import {PivotalException} from '@shared/foundation/exception/pivotal-exception';
import {DbTarget} from '@shared/typeorm';
import {ParticipantErrorCode, participantError} from '../error/participant-errors';
import {ParticipantKeyRepository} from '../repository';
import {GetJwsPolicyQuery} from './get-jws-policy.query';

/**
 * A participant's current JWS switches, so an operator changing one can see the other first.
 *
 * Read from the writer, not a replica: the screen that shows this value submits a change based on
 * it, and a lagging read would let an operator overwrite a setting they never saw.
 */
@QueryHandler(GetJwsPolicyQuery)
export class GetJwsPolicyHandler
    implements IQueryHandler<GetJwsPolicyQuery, GetJwsPolicyQuery.Output> {

    constructor(
        @Inject(ParticipantKeyRepository)
        private readonly repository: ParticipantKeyRepository,
    ) {
    }

    async execute(query: GetJwsPolicyQuery): Promise<GetJwsPolicyQuery.Output> {

        const fspId = query.input.fspId.trim();
        const key = fspId.length === 0 ? null : await this.repository.findByFspId(fspId, DbTarget.Write);

        if (key == null) {
            const error = participantError(ParticipantErrorCode.KEY_NOT_FOUND);

            throw new PivotalException(error.code, error.message);
        }

        return new GetJwsPolicyQuery.Output(
            key.fspId,
            key.role,
            key.jwsPublicKey != null && key.jwsPublicKey.trim().length > 0,
            key.jwsSignEnabled,
            key.jwsVerifyMode as FspiopVerifyMode,
        );
    }
}
