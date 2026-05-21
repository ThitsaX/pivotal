import {Injectable} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {DbTarget} from '@shared/typeorm';
import {Repository} from 'typeorm';
import {RolePermission} from '../model';
import {PIVOTAL_DB_READ_CONNECTION_NAME, PIVOTAL_DB_WRITE_CONNECTION_NAME} from './pivotal-connection-name';

@Injectable()
export class RolePermissionRepository {

    constructor(
        @InjectRepository(RolePermission, PIVOTAL_DB_WRITE_CONNECTION_NAME)
        private readonly writeRepository: Repository<RolePermission>,
        @InjectRepository(RolePermission, PIVOTAL_DB_READ_CONNECTION_NAME)
        private readonly readRepository: Repository<RolePermission>,
    ) {
    }

    async save(entity: RolePermission): Promise<RolePermission> {
        return this.writeRepository.save(entity);
    }

    async findByRoleId(roleId: string, target: DbTarget = DbTarget.Read): Promise<RolePermission[]> {
        return this.getRepository(target).find({where: {roleId}});
    }

    async findPermissionKeysByRoleId(roleId: string, target: DbTarget = DbTarget.Read): Promise<string[]> {

        const rows = await this.getRepository(target)
                               .createQueryBuilder('rp')
                               .innerJoin('permissions', 'p', 'p.id = rp.permission_id')
                               .select('p.key_name', 'keyName')
                               .where('rp.role_id = :roleId', {roleId})
                               .getRawMany<{keyName: string}>();

        return rows.map((row) => row.keyName);
    }

    async count(target: DbTarget = DbTarget.Read): Promise<number> {
        return this.getRepository(target).count();
    }

    private getRepository(target: DbTarget): Repository<RolePermission> {

        if (target === DbTarget.Write) {
            return this.writeRepository;
        }

        return this.readRepository;
    }
}
