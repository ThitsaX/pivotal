import {Injectable} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {DbTarget} from '@shared/typeorm';
import {Repository} from 'typeorm';
import {User} from '../model';
import {PIVOTAL_DB_READ_CONNECTION_NAME, PIVOTAL_DB_WRITE_CONNECTION_NAME} from './pivotal-connection-name';

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

    async count(target: DbTarget = DbTarget.Read): Promise<number> {
        return this.getRepository(target).count();
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

    private getRepository(target: DbTarget): Repository<User> {

        if (target === DbTarget.Write) {
            return this.writeRepository;
        }

        return this.readRepository;
    }
}
