import {Injectable} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {DbTarget} from '@shared/persistence';
import {Repository} from 'typeorm';
import {OutboundPartiesRequest} from '../../model';
import {MTPA_DB_READ_CONNECTION_NAME, MTPA_DB_WRITE_CONNECTION_NAME} from '../mtpa-connection-name';

@Injectable()
export class OutboundPartiesRequestRepository {

    constructor(
        @InjectRepository(OutboundPartiesRequest, MTPA_DB_WRITE_CONNECTION_NAME)
        private readonly writeRepository: Repository<OutboundPartiesRequest>,
        @InjectRepository(OutboundPartiesRequest, MTPA_DB_READ_CONNECTION_NAME)
        private readonly readRepository: Repository<OutboundPartiesRequest>,
    ) {
    }

    async save(entity: OutboundPartiesRequest): Promise<OutboundPartiesRequest> {
        return this.writeRepository.save(entity);
    }

    async findById(id: string, target: DbTarget = DbTarget.Read): Promise<OutboundPartiesRequest | null> {
        return this.getRepository(target).findOne({where: {id}});
    }

    async findByCorrelationId(
        correlationId: bigint,
        target: DbTarget = DbTarget.Read,
    ): Promise<OutboundPartiesRequest[]> {
        return this.getRepository(target).find({where: {correlationId}});
    }

    private getRepository(target: DbTarget): Repository<OutboundPartiesRequest> {

        if (target === DbTarget.Write) {
            return this.writeRepository;
        }

        return this.readRepository;
    }
}
