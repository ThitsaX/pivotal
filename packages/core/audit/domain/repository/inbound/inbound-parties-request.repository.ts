import {Injectable} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {DbTarget} from '@shared/persistence';
import {Repository} from 'typeorm';
import {InboundPartiesRequest} from '../../model';
import {MTPA_DB_READ_CONNECTION_NAME, MTPA_DB_WRITE_CONNECTION_NAME} from '../mtpa-connection-name';

@Injectable()
export class InboundPartiesRequestRepository {

    constructor(
        @InjectRepository(InboundPartiesRequest, MTPA_DB_WRITE_CONNECTION_NAME)
        private readonly writeRepository: Repository<InboundPartiesRequest>,
        @InjectRepository(InboundPartiesRequest, MTPA_DB_READ_CONNECTION_NAME)
        private readonly readRepository: Repository<InboundPartiesRequest>,
    ) {
    }

    async save(entity: InboundPartiesRequest): Promise<InboundPartiesRequest> {
        return this.writeRepository.save(entity);
    }

    async findById(id: string, target: DbTarget = DbTarget.Read): Promise<InboundPartiesRequest | null> {
        return this.getRepository(target).findOne({where: {id}});
    }

    async findByCorrelationId(
        correlationId: bigint,
        target: DbTarget = DbTarget.Read,
    ): Promise<InboundPartiesRequest[]> {
        return this.getRepository(target).find({where: {correlationId}});
    }

    private getRepository(target: DbTarget): Repository<InboundPartiesRequest> {

        if (target === DbTarget.Write) {
            return this.writeRepository;
        }

        return this.readRepository;
    }
}
