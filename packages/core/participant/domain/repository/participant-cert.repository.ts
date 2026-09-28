// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Injectable} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {DbTarget} from '@shared/typeorm';
import {In, LessThan, Not, Repository} from 'typeorm';
import {ParticipantCert} from '../model';
import {ParticipantCertStatusCode} from '../model/participant-cert-status.model';
import {PIVOTAL_DB_READ_CONNECTION_NAME, PIVOTAL_DB_WRITE_CONNECTION_NAME} from './pivotal-connection-name';

@Injectable()
export class ParticipantCertRepository {

    constructor(
        @InjectRepository(ParticipantCert, PIVOTAL_DB_WRITE_CONNECTION_NAME)
        private readonly writeRepository: Repository<ParticipantCert>,
        @InjectRepository(ParticipantCert, PIVOTAL_DB_READ_CONNECTION_NAME)
        private readonly readRepository: Repository<ParticipantCert>,
    ) {
    }

    async save(entity: ParticipantCert): Promise<ParticipantCert> {
        return this.writeRepository.save(entity);
    }

    /**
     * The runtime lookup: resolve a presented certificate to the tenant it was issued to.
     *
     * Deliberately returns a row in any status. A revoked or expired certificate must resolve to a
     * reason rather than to nothing — the caller decides what to do with the status, and a lookup
     * miss is reserved for a certificate this deployment never issued.
     */
    async findByFingerprint(
        fingerprintSha256: string,
        target: DbTarget = DbTarget.Read,
    ): Promise<ParticipantCert | null> {

        return this.getRepository(target).findOne({where: {fingerprintSha256}});
    }

    async findByFspId(fspId: string, target: DbTarget = DbTarget.Read): Promise<ParticipantCert[]> {
        return this.getRepository(target).find({where: {fspId}, order: {issuedAt: 'DESC'}});
    }

    async findById(id: string, target: DbTarget = DbTarget.Read): Promise<ParticipantCert | null> {
        return this.getRepository(target).findOne({where: {id}});
    }

    /** Everything a tenant can still present, newest first. */
    async findUsableByFspId(fspId: string, target: DbTarget = DbTarget.Read): Promise<ParticipantCert[]> {

        return this.getRepository(target).find({
            where: {
                fspId,
                status: In([ParticipantCertStatusCode.ACTIVE, ParticipantCertStatusCode.RETIRING]),
            },
            order: {issuedAt: 'DESC'},
        });
    }

    /**
     * Certificates whose validity has passed but whose status has not caught up.
     *
     * Expiry is a fact about the clock rather than an event anything emits, so a row only becomes
     * `expired` when something looks. Revoked rows are left alone: revocation is the stronger
     * statement and overwriting it would lose why the certificate stopped being accepted.
     */
    async findLapsed(now: Date, target: DbTarget = DbTarget.Read): Promise<ParticipantCert[]> {

        return this.getRepository(target).find({
            where: {
                validTo: LessThan(now),
                status: Not(In([ParticipantCertStatusCode.EXPIRED, ParticipantCertStatusCode.REVOKED])),
            },
        });
    }

    private getRepository(target: DbTarget): Repository<ParticipantCert> {

        if (target === DbTarget.Write) {
            return this.writeRepository;
        }

        return this.readRepository;
    }
}
