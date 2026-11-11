// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {PivotalException} from '@shared/foundation/exception/pivotal-exception';
import {DbTarget} from '@shared/typeorm';
import {ParticipantCertStatusCode} from '../model/participant-cert-status.model';
import {ParticipantErrorCode, participantError} from '../error/participant-errors';
import {ParticipantCertRepository} from '../repository';
import {RevokeDfspCertificateCommand} from './revoke-dfsp-certificate.command';

/**
 * Withdraws a certificate before it expires.
 *
 * The row is updated, never deleted. A revoked certificate whose row has been removed stops
 * resolving at all, and a lookup miss is indistinguishable from a certificate this deployment never
 * issued — which turns a deliberate withdrawal into an unexplained rejection.
 */
@CommandHandler(RevokeDfspCertificateCommand)
export class RevokeDfspCertificateHandler
    implements ICommandHandler<RevokeDfspCertificateCommand, RevokeDfspCertificateCommand.Output> {

    constructor(
        @Inject(ParticipantCertRepository)
        private readonly certificates: ParticipantCertRepository,
    ) {
    }

    async execute(command: RevokeDfspCertificateCommand): Promise<RevokeDfspCertificateCommand.Output> {

        const certificate = await this.certificates.findById(command.input.id, DbTarget.Write);

        if (certificate == null) {
            const error = participantError(ParticipantErrorCode.CERT_NOT_FOUND);

            throw new PivotalException(error.code, error.message);
        }

        if (certificate.status === ParticipantCertStatusCode.REVOKED) {
            const error = participantError(ParticipantErrorCode.CERT_ALREADY_REVOKED);

            throw new PivotalException(error.code, error.message);
        }

        certificate.status = ParticipantCertStatusCode.REVOKED;
        certificate.revokedAt = new Date();

        // Appended rather than replacing the enrollment note: why it was issued and why it was
        // withdrawn are both worth keeping.
        if (command.input.reason != null && command.input.reason.trim().length > 0) {
            const reason = `Revoked: ${command.input.reason.trim()}`;

            certificate.note = certificate.note == null || certificate.note.length === 0
                ? reason
                : `${certificate.note} | ${reason}`;
        }

        const saved = await this.certificates.save(certificate);

        return new RevokeDfspCertificateCommand.Output(
            saved.id, saved.fspId, saved.status, saved.revokedAt!);
    }
}
