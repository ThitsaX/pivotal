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

    async findByMenuId(menuId: string, target: DbTarget = DbTarget.Read): Promise<MenuPermission[]> {
        return this.getRepository(target).find({where: {menuId}});
    }

    async findPermissionKeysByMenuId(menuId: string, target: DbTarget = DbTarget.Read): Promise<string[]> {

        const rows = await this.getRepository(target)
                               .createQueryBuilder('mp')
                               .innerJoin('permissions', 'p', 'p.id = mp.permission_id')
                               .select('p.key_name', 'keyName')
                               .where('mp.menu_id = :menuId', {menuId})
                               .getRawMany<{keyName: string}>();

        return rows.map((row) => row.keyName);
    }

    async countByMenuId(menuId: string, target: DbTarget = DbTarget.Read): Promise<number> {
        return this.getRepository(target).count({where: {menuId}});
    }

    async replaceForMenu(menuId: string, permissionIds: string[]): Promise<void> {
        await this.writeRepository.manager.transaction(async (em) => {
            await em.delete(MenuPermission, {menuId});
            if (permissionIds.length > 0) {
                const rows = permissionIds.map((permissionId) => new MenuPermission(menuId, permissionId));
                await em.insert(MenuPermission, rows);
            }
        });
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
