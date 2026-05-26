import {Injectable} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {DbTarget} from '@shared/typeorm';
import {Brackets, Repository} from 'typeorm';
import {User} from '../model';
import {PIVOTAL_DB_READ_CONNECTION_NAME, PIVOTAL_DB_WRITE_CONNECTION_NAME} from './pivotal-connection-name';

export interface UserListFilters {
    page:     number;
    pageSize: number;
    roleId?:  string;
    fspId?:   string;
    isActive?: boolean;
    search?:  string;
}

export interface UserListPage {
    items:    User[];
    page:     number;
    pageSize: number;
    total:    number;
}

export interface UserUpdate {
    roleId?:   string;
    fspId?:    string | null;
    isActive?: boolean;
}

@Injectable()
export class UserRepository {

    constructor(
        @InjectRepository(User, PIVOTAL_DB_WRITE_CONNECTION_NAME)
        private readonly writeRepository: Repository<User>,
        @InjectRepository(User, PIVOTAL_DB_READ_CONNECTION_NAME)
        private readonly readRepository: Repository<User>,
    ) {
    }

    async save(entity: User): Promise<User> {
        return this.writeRepository.save(entity);
    }

    async findById(id: string, target: DbTarget = DbTarget.Read): Promise<User | null> {
        return this.getRepository(target).findOne({where: {id}});
    }

    async findByEmail(email: string, target: DbTarget = DbTarget.Read): Promise<User | null> {
        return this.getRepository(target).findOne({where: {email}});
    }

    async findAll(filters: UserListFilters, target: DbTarget = DbTarget.Read): Promise<UserListPage> {

        const qb = this.getRepository(target).createQueryBuilder('u');

        if (filters.roleId != null) {
            qb.andWhere('u.role_id = :roleId', {roleId: filters.roleId});
        }

        if (filters.fspId != null) {
            qb.andWhere('u.fsp_id = :fspId', {fspId: filters.fspId});
        }

        if (filters.isActive != null) {
            qb.andWhere('u.is_active = :isActive', {isActive: filters.isActive});
        }

        if (filters.search != null && filters.search.trim().length > 0) {
            const like = `%${filters.search.trim()}%`;
            qb.andWhere(new Brackets((sub) => {
                sub.where('u.email LIKE :like', {like})
                   .orWhere('u.fsp_id LIKE :like', {like});
            }));
        }

        qb.orderBy('u.created_at', 'DESC')
          .skip((filters.page - 1) * filters.pageSize)
          .take(filters.pageSize);

        const [items, total] = await qb.getManyAndCount();

        return {items, page: filters.page, pageSize: filters.pageSize, total};
    }

    async count(target: DbTarget = DbTarget.Read): Promise<number> {
        return this.getRepository(target).count();
    }

    async countByRoleId(roleId: string, target: DbTarget = DbTarget.Read): Promise<number> {
        return this.getRepository(target).count({where: {roleId}});
    }

    async countActiveUsersGrantingPermission(
        permissionKey: string,
        excludeUserId?: string,
        target: DbTarget = DbTarget.Read,
    ): Promise<number> {

        const qb = this.getRepository(target).createQueryBuilder('u')
                       .innerJoin('role_permissions', 'rp', 'rp.role_id = u.role_id')
                       .innerJoin('permissions', 'p', 'p.id = rp.permission_id')
                       .where('u.is_active = TRUE')
                       .andWhere('p.key_name = :permissionKey', {permissionKey});

        if (excludeUserId != null) {
            qb.andWhere('u.id != :excludeUserId', {excludeUserId});
        }

        return qb.getCount();
    }

    async incrementFailedAttempts(id: string): Promise<void> {
        await this.writeRepository.increment({id}, 'failedLoginAttempts', 1);
    }

    async lockUntil(id: string, until: Date): Promise<void> {
        await this.writeRepository.update({id}, {lockedUntil: until});
    }

    async recordSuccessfulLogin(id: string): Promise<void> {
        await this.writeRepository.update(
            {id},
            {
                lastLoginAt:          new Date(),
                failedLoginAttempts:  0,
                lockedUntil:          null,
            },
        );
    }

    async updatePasswordHash(id: string, passwordHash: string, mustChangePassword: boolean): Promise<void> {
        await this.writeRepository.update({id}, {passwordHash, mustChangePassword});
    }

    async update(id: string, partial: UserUpdate): Promise<void> {
        await this.writeRepository.update({id}, partial);
    }

    async deactivate(id: string): Promise<void> {
        await this.writeRepository.update({id}, {isActive: false});
    }

    async invalidateTokens(id: string): Promise<void> {
        await this.writeRepository.update({id}, {tokensInvalidatedAt: new Date()});
    }

    async invalidateTokensForRole(roleId: string): Promise<void> {
        await this.writeRepository.update({roleId}, {tokensInvalidatedAt: new Date()});
    }

    private getRepository(target: DbTarget): Repository<User> {

        if (target === DbTarget.Write) {
            return this.writeRepository;
        }

        return this.readRepository;
    }
}
