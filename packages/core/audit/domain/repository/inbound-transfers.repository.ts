import {Injectable} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {DbTarget} from '@shared/typeorm';
import {Repository} from 'typeorm';
import {InboundTransfers} from '../model';
import {PIVOTAL_DB_READ_CONNECTION_NAME, PIVOTAL_DB_WRITE_CONNECTION_NAME} from './pivotal-connection-name';

@Injectable()
export class InboundTransfersRepository {

    constructor(
        @InjectRepository(InboundTransfers, PIVOTAL_DB_WRITE_CONNECTION_NAME)
        private readonly writeRepository: Repository<InboundTransfers>,
        @InjectRepository(InboundTransfers, PIVOTAL_DB_READ_CONNECTION_NAME)
        private readonly readRepository: Repository<InboundTransfers>,
    ) {
    }

    async save(entity: InboundTransfers): Promise<InboundTransfers> {
        return this.writeRepository.save(entity);
    }

    async findById(id: string, target: DbTarget = DbTarget.Read): Promise<InboundTransfers | null> {
        return this.getRepository(target).findOne({where: {id}});
    }

    async findByTransferId(transferId: string, target: DbTarget = DbTarget.Read): Promise<InboundTransfers | null> {
        return this.getRepository(target).findOne({where: {transferId}});
    }

    private getRepository(target: DbTarget): Repository<InboundTransfers> {

        if (target === DbTarget.Write) {
            return this.writeRepository;
        }

        return this.readRepository;
    }
}
