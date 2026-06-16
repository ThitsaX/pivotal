import {Injectable} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {DbTarget} from '@shared/typeorm';
import {Repository} from 'typeorm';
import {Menu} from '../model';
import {PIVOTAL_DB_READ_CONNECTION_NAME, PIVOTAL_DB_WRITE_CONNECTION_NAME} from './pivotal-connection-name';

export interface MenuUpdate {
    groupLabel?: string;
    label?:      string;
    route?:      string;
    icon?:       string | null;
    sortOrder?:  number;
    parentId?:   string | null;
    isActive?:   boolean;
}

@Injectable()
export class MenuRepository {

    constructor(
        @InjectRepository(Menu, PIVOTAL_DB_WRITE_CONNECTION_NAME)
        private readonly writeRepository: Repository<Menu>,
        @InjectRepository(Menu, PIVOTAL_DB_READ_CONNECTION_NAME)
        private readonly readRepository: Repository<Menu>,
    ) {
    }

    async save(entity: Menu): Promise<Menu> {
        return this.writeRepository.save(entity);
    }

    async findById(id: string, target: DbTarget = DbTarget.Read): Promise<Menu | null> {
        return this.getRepository(target).findOne({where: {id}});
    }

    async findByMenuKey(menuKey: string, target: DbTarget = DbTarget.Read): Promise<Menu | null> {
        return this.getRepository(target).findOne({where: {menuKey}});
    }

    async findAllForAdmin(target: DbTarget = DbTarget.Read): Promise<Menu[]> {
        return this.getRepository(target).find({
            where: {isActive: true},
            order: {groupLabel: 'ASC', sortOrder: 'ASC'},
        });
    }

    async update(id: string, partial: MenuUpdate): Promise<void> {
        await this.writeRepository.update({id}, partial);
    }

    async delete(id: string): Promise<void> {
        await this.writeRepository.delete({id});
    }

    async findActiveByPermissionKeys(permissionKeys: string[], target: DbTarget = DbTarget.Read): Promise<Menu[]> {

        if (permissionKeys.length === 0) {
            return [];
        }

        return this.getRepository(target)
                   .createQueryBuilder('m')
                   .innerJoin('menu_permissions', 'mp', 'mp.menu_id = m.id')
                   .innerJoin('permissions', 'p', 'p.id = mp.permission_id')
                   .where('m.is_active = TRUE')
                   .andWhere('p.key_name IN (:...permissionKeys)', {permissionKeys})
                   .orderBy('m.group_label', 'ASC')
                   .addOrderBy('m.sort_order', 'ASC')
                   .distinct(true)
                   .getMany();
    }

    async count(target: DbTarget = DbTarget.Read): Promise<number> {
        return this.getRepository(target).count();
    }

    private getRepository(target: DbTarget): Repository<Menu> {

        if (target === DbTarget.Write) {
            return this.writeRepository;
        }

        return this.readRepository;
    }
}
