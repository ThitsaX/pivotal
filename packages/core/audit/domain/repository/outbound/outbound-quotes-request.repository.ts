import {Injectable} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {DbTarget} from '@shared/persistence';
import {Repository} from 'typeorm';
import {OutboundQuotesRequest} from '../../model';
import {MTPA_DB_READ_CONNECTION_NAME, MTPA_DB_WRITE_CONNECTION_NAME} from '../mtpa-connection-name';

@Injectable()
export class OutboundQuotesRequestRepository {

    constructor(
        @InjectRepository(OutboundQuotesRequest, MTPA_DB_WRITE_CONNECTION_NAME)
        private readonly writeRepository: Repository<OutboundQuotesRequest>,
        @InjectRepository(OutboundQuotesRequest, MTPA_DB_READ_CONNECTION_NAME)
        private readonly readRepository: Repository<OutboundQuotesRequest>,
    ) {
    }

    async save(entity: OutboundQuotesRequest): Promise<OutboundQuotesRequest> {
        return this.writeRepository.save(entity);
    }

    async findById(id: string, target: DbTarget = DbTarget.Read): Promise<OutboundQuotesRequest | null> {
        return this.getRepository(target).findOne({where: {id}});
    }

    async findByCorrelationId(
        correlationId: bigint,
        target: DbTarget = DbTarget.Read,
    ): Promise<OutboundQuotesRequest[]> {
        return this.getRepository(target).find({where: {correlationId}});
    }

    async findByQuoteId(quoteId: string, target: DbTarget = DbTarget.Read): Promise<OutboundQuotesRequest | null> {
        return this.getRepository(target).findOne({where: {quoteId}});
    }

    private getRepository(target: DbTarget): Repository<OutboundQuotesRequest> {

        if (target === DbTarget.Write) {
            return this.writeRepository;
        }

        return this.readRepository;
    }
}
