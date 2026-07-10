// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Injectable} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {DbTarget} from '@shared/typeorm';
import {Repository} from 'typeorm';
import {MenuPermission} from '../model';
import {PIVOTAL_DB_READ_CONNECTION_NAME, PIVOTAL_DB_WRITE_CONNECTION_NAME} from './pivotal-connection-name';

@Injectable()
export class MenuPermissionRepository {

    constructor(
        @InjectRepository(MenuPermission, PIVOTAL_DB_WRITE_CONNECTION_NAME)
        private readonly writeRepository: Repository<MenuPermission>,
        @InjectRepository(MenuPermission, PIVOTAL_DB_READ_CONNECTION_NAME)
        private readonly readRepository: Repository<MenuPermission>,
    ) {
    }

    async save(entity: MenuPermission): Promise<MenuPermission> {
        return this.writeRepository.save(entity);
    }

    async count(target: DbTarget = DbTarget.Read): Promise<number> {
        return this.getRepository(target).count();
    }

    private getRepository(target: DbTarget): Repository<MenuPermission> {

        if (target === DbTarget.Write) {
            return this.writeRepository;
        }

        return this.readRepository;
    }
}
