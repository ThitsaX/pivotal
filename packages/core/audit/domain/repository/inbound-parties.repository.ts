import {Injectable} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {DbTarget} from '@shared/typeorm';
import {Repository} from 'typeorm';
import {InboundParties} from '../model';
import {PIVOTAL_DB_READ_CONNECTION_NAME, PIVOTAL_DB_WRITE_CONNECTION_NAME} from './pivotal-connection-name';

@Injectable()
export class InboundPartiesRepository {

    constructor(
        @InjectRepository(InboundParties, PIVOTAL_DB_WRITE_CONNECTION_NAME)
        private readonly writeRepository: Repository<InboundParties>,
        @InjectRepository(InboundParties, PIVOTAL_DB_READ_CONNECTION_NAME)
        private readonly readRepository: Repository<InboundParties>,
    ) {
    }

    async save(entity: InboundParties): Promise<InboundParties> {
        return this.writeRepository.save(entity);
    }

    async findById(id: string, target: DbTarget = DbTarget.Read): Promise<InboundParties | null> {
        return this.getRepository(target).findOne({where: {id}});
    }

    private getRepository(target: DbTarget): Repository<InboundParties> {

        if (target === DbTarget.Write) {
            return this.writeRepository;
        }

        return this.readRepository;
    }
}
