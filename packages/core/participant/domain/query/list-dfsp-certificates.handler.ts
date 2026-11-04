// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Inject} from '@nestjs/common';
import {IQueryHandler, QueryHandler} from '@nestjs/cqrs';
import {ParticipantCertRepository} from '../repository';
import {ListDfspCertificatesQuery} from './list-dfsp-certificates.query';

@QueryHandler(ListDfspCertificatesQuery)
export class ListDfspCertificatesHandler
    implements IQueryHandler<ListDfspCertificatesQuery, ListDfspCertificatesQuery.Output> {

    constructor(
        @Inject(ParticipantCertRepository)
        private readonly certificates: ParticipantCertRepository,
    ) {
    }

    async execute(query: ListDfspCertificatesQuery): Promise<ListDfspCertificatesQuery.Output> {

        const rows = await this.certificates.findByFspId(query.input.fspId.trim());

        // Every status is returned, including revoked and expired. The operator screen exists to
        // answer "what does this DFSP hold and what happened to it", which a filtered list cannot.
        return new ListDfspCertificatesQuery.Output(
            rows.map(row => new ListDfspCertificatesQuery.Item(
                row.id,
                row.fspId,
                row.serial,
                row.fingerprintSha256,
                row.subject,
                row.status,
                row.validFrom,
                row.validTo,
                row.issuedAt,
                row.revokedAt,
                row.note,
            )),
        );
    }
}
