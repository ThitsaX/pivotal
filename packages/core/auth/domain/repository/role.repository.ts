import {Injectable} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {DbTarget} from '@shared/typeorm';
import {Repository} from 'typeorm';
import {Role} from '../model';
import {PIVOTAL_DB_READ_CONNECTION_NAME, PIVOTAL_DB_WRITE_CONNECTION_NAME} from './pivotal-connection-name';

@Injectable()
export class RoleRepository {

    constructor(
        @InjectRepository(Role, PIVOTAL_DB_WRITE_CONNECTION_NAME)
        private readonly writeRepository: Repository<Role>,
        @InjectRepository(Role, PIVOTAL_DB_READ_CONNECTION_NAME)
        private readonly readRepository: Repository<Role>,
    ) {
    }

    async save(entity: Role): Promise<Role> {
        return this.writeRepository.save(entity);
    }

    async findById(id: string, target: DbTarget = DbTarget.Read): Promise<Role | null> {
        return this.getRepository(target).findOne({where: {id}});
    }

    async findByCode(code: string, target: DbTarget = DbTarget.Read): Promise<Role | null> {
        return this.getRepository(target).findOne({where: {code}});
    }

    async findAll(target: DbTarget = DbTarget.Read): Promise<Role[]> {
        return this.getRepository(target).find();
    }

    async count(target: DbTarget = DbTarget.Read): Promise<number> {
        return this.getRepository(target).count();
    }

    private getRepository(target: DbTarget): Repository<Role> {

        if (target === DbTarget.Write) {
            return this.writeRepository;
        }

        return this.readRepository;
    }
}
