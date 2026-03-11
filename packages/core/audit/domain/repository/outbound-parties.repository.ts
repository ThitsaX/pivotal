import {Injectable} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {DbTarget} from '@shared/typeorm';
import {Repository} from 'typeorm';
import {OutboundParties} from '../model';
import {PAYPORT_DB_READ_CONNECTION_NAME, PAYPORT_DB_WRITE_CONNECTION_NAME} from './payport-connection-name';

@Injectable()
export class OutboundPartiesRepository {

    constructor(
        @InjectRepository(OutboundParties, PAYPORT_DB_WRITE_CONNECTION_NAME)
        private readonly writeRepository: Repository<OutboundParties>,
        @InjectRepository(OutboundParties, PAYPORT_DB_READ_CONNECTION_NAME)
        private readonly readRepository: Repository<OutboundParties>,
    ) {
    }

    async save(entity: OutboundParties): Promise<OutboundParties> {
        return this.writeRepository.save(entity);
    }

    async findById(id: string, target: DbTarget = DbTarget.Read): Promise<OutboundParties | null> {
        return this.getRepository(target).findOne({where: {id}});
    }

    private getRepository(target: DbTarget): Repository<OutboundParties> {

        if (target === DbTarget.Write) {
            return this.writeRepository;
        }

        return this.readRepository;
    }
}
