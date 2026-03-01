import {Injectable} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {DbTarget} from '@shared/persistence';
import {Repository} from 'typeorm';
import {InboundTransfersRequest} from '../../model';
import {MTPA_DB_READ_CONNECTION_NAME, MTPA_DB_WRITE_CONNECTION_NAME} from '../mtpa-connection-name';

@Injectable()
export class InboundTransfersRequestRepository {

    constructor(
        @InjectRepository(InboundTransfersRequest, MTPA_DB_WRITE_CONNECTION_NAME)
        private readonly writeRepository: Repository<InboundTransfersRequest>,
        @InjectRepository(InboundTransfersRequest, MTPA_DB_READ_CONNECTION_NAME)
        private readonly readRepository: Repository<InboundTransfersRequest>,
    ) {
    }

    async save(entity: InboundTransfersRequest): Promise<InboundTransfersRequest> {
        return this.writeRepository.save(entity);
    }

    async findById(id: string, target: DbTarget = DbTarget.Read): Promise<InboundTransfersRequest | null> {
        return this.getRepository(target).findOne({where: {id}});
    }

    async findByCorrelationId(
        correlationId: bigint,
        target: DbTarget = DbTarget.Read,
    ): Promise<InboundTransfersRequest[]> {
        return this.getRepository(target).find({where: {correlationId}});
    }

    async findByTransferId(transferId: string, target: DbTarget = DbTarget.Read): Promise<InboundTransfersRequest | null> {
        return this.getRepository(target).findOne({where: {transferId}});
    }

    private getRepository(target: DbTarget): Repository<InboundTransfersRequest> {

        if (target === DbTarget.Write) {
            return this.writeRepository;
        }

        return this.readRepository;
    }
}
