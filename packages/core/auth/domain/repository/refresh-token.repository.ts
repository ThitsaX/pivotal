// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {Injectable} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {DbTarget} from '@shared/typeorm';
import {IsNull, Repository} from 'typeorm';
import {RefreshToken} from '../model';
import {PIVOTAL_DB_READ_CONNECTION_NAME, PIVOTAL_DB_WRITE_CONNECTION_NAME} from './pivotal-connection-name';

@Injectable()
export class RefreshTokenRepository {

    constructor(
        @InjectRepository(RefreshToken, PIVOTAL_DB_WRITE_CONNECTION_NAME)
        private readonly writeRepository: Repository<RefreshToken>,
        @InjectRepository(RefreshToken, PIVOTAL_DB_READ_CONNECTION_NAME)
        private readonly readRepository: Repository<RefreshToken>,
    ) {
    }

    async save(entity: RefreshToken): Promise<RefreshToken> {
        return this.writeRepository.save(entity);
    }

    async findByTokenHash(tokenHash: string, target: DbTarget = DbTarget.Read): Promise<RefreshToken | null> {
        return this.getRepository(target).findOne({where: {tokenHash}});
    }

    async findByFamilyId(familyId: string, target: DbTarget = DbTarget.Read): Promise<RefreshToken[]> {
        return this.getRepository(target).find({where: {familyId}});
    }

    async findActiveByUserId(userId: string, target: DbTarget = DbTarget.Read): Promise<RefreshToken[]> {
        return this.getRepository(target).find({where: {userId, revokedAt: IsNull()}});
    }

    async markRevoked(id: string, replacedBy: string | null = null): Promise<void> {
        await this.writeRepository.update({id}, {revokedAt: new Date(), replacedBy});
    }

    async revokeFamily(familyId: string): Promise<void> {
        await this.writeRepository.update(
            {familyId, revokedAt: IsNull()},
            {revokedAt: new Date()},
        );
    }

    async revokeAllForUser(userId: string): Promise<void> {
        await this.writeRepository.update(
            {userId, revokedAt: IsNull()},
            {revokedAt: new Date()},
        );
    }

    private getRepository(target: DbTarget): Repository<RefreshToken> {

        if (target === DbTarget.Write) {
            return this.writeRepository;
        }

        return this.readRepository;
    }
}
