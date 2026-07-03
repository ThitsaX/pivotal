// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {Injectable} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {DbTarget} from '@shared/typeorm';
import {Repository} from 'typeorm';
import {Participant} from '../model';
import {PIVOTAL_DB_READ_CONNECTION_NAME, PIVOTAL_DB_WRITE_CONNECTION_NAME} from './pivotal-connection-name';

@Injectable()
export class ParticipantRepository {

    constructor(
        @InjectRepository(Participant, PIVOTAL_DB_WRITE_CONNECTION_NAME)
        private readonly writeRepository: Repository<Participant>,
        @InjectRepository(Participant, PIVOTAL_DB_READ_CONNECTION_NAME)
        private readonly readRepository: Repository<Participant>,
    ) {
    }

    async save(entity: Participant): Promise<Participant> {
        return this.writeRepository.save(entity);
    }

    async findById(id: string, target: DbTarget = DbTarget.Read): Promise<Participant | null> {
        return this.getRepository(target).findOne({where: {id}});
    }

    async findByName(name: string, target: DbTarget = DbTarget.Read): Promise<Participant | null> {
        return this.getRepository(target).findOne({where: {name}});
    }

    async findAll(target: DbTarget = DbTarget.Read): Promise<Participant[]> {
        return this.getRepository(target).find();
    }

    private getRepository(target: DbTarget): Repository<Participant> {

        if (target === DbTarget.Write) {
            return this.writeRepository;
        }

        return this.readRepository;
    }
}
