import {Injectable} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {DbTarget} from '@shared/typeorm';
import {Repository} from 'typeorm';
import {OutboundTransfers} from '../model';
import {PIVOTAL_DB_READ_CONNECTION_NAME, PIVOTAL_DB_WRITE_CONNECTION_NAME} from './pivotal-connection-name';

@Injectable()
export class OutboundTransfersRepository {

    constructor(
        @InjectRepository(OutboundTransfers, PIVOTAL_DB_WRITE_CONNECTION_NAME)
        private readonly writeRepository: Repository<OutboundTransfers>,
        @InjectRepository(OutboundTransfers, PIVOTAL_DB_READ_CONNECTION_NAME)
        private readonly readRepository: Repository<OutboundTransfers>,
    ) {
    }

    async save(entity: OutboundTransfers): Promise<OutboundTransfers> {
        return this.writeRepository.save(entity);
    }

    async findById(id: string, target: DbTarget = DbTarget.Read): Promise<OutboundTransfers | null> {
        return this.getRepository(target).findOne({where: {id}});
    }

    async findByTransferId(transferId: string, target: DbTarget = DbTarget.Read): Promise<OutboundTransfers | null> {
        return this.getRepository(target).findOne({where: {transferId}});
    }

    private getRepository(target: DbTarget): Repository<OutboundTransfers> {

        if (target === DbTarget.Write) {
            return this.writeRepository;
        }

        return this.readRepository;
    }
}
