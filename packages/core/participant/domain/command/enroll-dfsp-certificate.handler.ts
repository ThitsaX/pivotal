// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Inject, Optional} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {PivotalException} from '@shared/foundation/exception/pivotal-exception';
import {DbTarget} from '@shared/typeorm';
import {DfspCertificateIssuer} from '../component/cert';
import {ParticipantErrorCode, participantError} from '../error/participant-errors';
import {ParticipantRepository} from '../repository';
import {EnrollDfspCertificateCommand} from './enroll-dfsp-certificate.command';

@CommandHandler(EnrollDfspCertificateCommand)
export class EnrollDfspCertificateHandler
    implements ICommandHandler<EnrollDfspCertificateCommand, EnrollDfspCertificateCommand.Output> {

    constructor(
        @Optional() @Inject(DfspCertificateIssuer)
        private readonly issuer: DfspCertificateIssuer | null,
        @Inject(ParticipantRepository)
        private readonly participants: ParticipantRepository,
    ) {
    }

    async execute(command: EnrollDfspCertificateCommand): Promise<EnrollDfspCertificateCommand.Output> {

        const fspId = command.input.fspId.trim();

        if (this.issuer == null) {
            throw new PivotalException(
                'PARTICIPANT_CERT_ISSUER_NOT_CONFIGURED',
                'This deployment does not issue DFSP certificates. Configure the DFSP-facing CA first.',
            );
        }

        // The participant must exist before a certificate names it. A certificate whose common name
        // resolves to no participant would pass every check at the edge and then bind to nothing.
        const participant = await this.participants.findByName(fspId, DbTarget.Write);

        if (participant == null) {
            const error = participantError(ParticipantErrorCode.UNKNOWN_PARTICIPANT);

            throw new PivotalException(error.code, error.message);
        }

        const issued = await this.issuer.issue({
            fspId,
            csrPem: command.input.csrPem.trim(),
            note: command.input.note?.trim(),
        });

        return new EnrollDfspCertificateCommand.Output(
            issued.id,
            issued.fspId,
            issued.serial,
            issued.fingerprintSha256,
            issued.subject,
            issued.validFrom,
            issued.validTo,
            issued.certPem,
            issued.caChainPem,
        );
    }
}
