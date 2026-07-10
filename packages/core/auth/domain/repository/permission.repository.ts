// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Injectable} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {DbTarget} from '@shared/typeorm';
import {In, Repository} from 'typeorm';
import {Permission} from '../model';
import {PIVOTAL_DB_READ_CONNECTION_NAME, PIVOTAL_DB_WRITE_CONNECTION_NAME} from './pivotal-connection-name';

@Injectable()
export class PermissionRepository {

    constructor(
        @InjectRepository(Permission, PIVOTAL_DB_WRITE_CONNECTION_NAME)
        private readonly writeRepository: Repository<Permission>,
        @InjectRepository(Permission, PIVOTAL_DB_READ_CONNECTION_NAME)
        private readonly readRepository: Repository<Permission>,
    ) {
    }

    async save(entity: Permission): Promise<Permission> {
        return this.writeRepository.save(entity);
    }

    async findByKeyName(keyName: string, target: DbTarget = DbTarget.Read): Promise<Permission | null> {
        return this.getRepository(target).findOne({where: {keyName}});
    }

    async findByKeyNames(keyNames: string[], target: DbTarget = DbTarget.Read): Promise<Permission[]> {
        if (keyNames.length === 0) {
            return [];
        }
        return this.getRepository(target).find({where: {keyName: In(keyNames)}});
    }

    async findAll(target: DbTarget = DbTarget.Read): Promise<Permission[]> {
        return this.getRepository(target).find({order: {keyName: 'ASC'}});
    }

    async count(target: DbTarget = DbTarget.Read): Promise<number> {
        return this.getRepository(target).count();
    }

    private getRepository(target: DbTarget): Repository<Permission> {

        if (target === DbTarget.Write) {
            return this.writeRepository;
        }

        return this.readRepository;
    }
}
