// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Injectable} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {DbTarget} from '@shared/typeorm';
import {Repository} from 'typeorm';
import {ParticipantKey} from '../model';
import {PIVOTAL_DB_READ_CONNECTION_NAME, PIVOTAL_DB_WRITE_CONNECTION_NAME} from './pivotal-connection-name';

@Injectable()
export class ParticipantKeyRepository {

    constructor(
        @InjectRepository(ParticipantKey, PIVOTAL_DB_WRITE_CONNECTION_NAME)
        private readonly writeRepository: Repository<ParticipantKey>,
        @InjectRepository(ParticipantKey, PIVOTAL_DB_READ_CONNECTION_NAME)
        private readonly readRepository: Repository<ParticipantKey>,
    ) {
    }

    async save(entity: ParticipantKey): Promise<ParticipantKey> {
        return this.writeRepository.save(entity);
    }

    async findByFspId(fspId: string, target: DbTarget = DbTarget.Read): Promise<ParticipantKey | null> {
        return this.getRepository(target).findOne({where: {fspId}});
    }

    async findAll(target: DbTarget = DbTarget.Read): Promise<ParticipantKey[]> {
        return this.getRepository(target).find();
    }

    private getRepository(target: DbTarget): Repository<ParticipantKey> {

        if (target === DbTarget.Write) {
            return this.writeRepository;
        }

        return this.readRepository;
    }
}
