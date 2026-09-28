// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Inject} from '@nestjs/common';
import {IQueryHandler, QueryHandler} from '@nestjs/cqrs';
import {PivotalException} from '@shared/foundation/exception/pivotal-exception';
import {ParticipantErrorCode, participantError} from '../error/participant-errors';
import {ParticipantCertRepository} from '../repository';
import {GetDfspCertificateQuery} from './get-dfsp-certificate.query';

@QueryHandler(GetDfspCertificateQuery)
export class GetDfspCertificateHandler
    implements IQueryHandler<GetDfspCertificateQuery, GetDfspCertificateQuery.Output> {

    constructor(
        @Inject(ParticipantCertRepository)
        private readonly certificates: ParticipantCertRepository,
    ) {
    }

    async execute(query: GetDfspCertificateQuery): Promise<GetDfspCertificateQuery.Output> {

        const certificate = await this.certificates.findById(query.input.id);

        if (certificate == null) {
            const error = participantError(ParticipantErrorCode.CERT_NOT_FOUND);

            throw new PivotalException(error.code, error.message);
        }

        return new GetDfspCertificateQuery.Output(
            certificate.id,
            certificate.fspId,
            certificate.serial,
            certificate.status,
            certificate.certPem,
            certificate.caChainPem,
        );
    }
}
