import {Injectable} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {DbTarget} from '@shared/persistence';
import {Repository} from 'typeorm';
import {InboundQuotesRequest} from '../../model';
import {MTPA_DB_READ_CONNECTION_NAME, MTPA_DB_WRITE_CONNECTION_NAME} from '../mtpa-connection-name';

@Injectable()
export class InboundQuotesRequestRepository {

    constructor(
        @InjectRepository(InboundQuotesRequest, MTPA_DB_WRITE_CONNECTION_NAME)
        private readonly writeRepository: Repository<InboundQuotesRequest>,
        @InjectRepository(InboundQuotesRequest, MTPA_DB_READ_CONNECTION_NAME)
        private readonly readRepository: Repository<InboundQuotesRequest>,
    ) {
    }

    async save(entity: InboundQuotesRequest): Promise<InboundQuotesRequest> {
        return this.writeRepository.save(entity);
    }

    async findById(id: string, target: DbTarget = DbTarget.Read): Promise<InboundQuotesRequest | null> {
        return this.getRepository(target).findOne({where: {id}});
    }

    async findByCorrelationId(
        correlationId: bigint,
        target: DbTarget = DbTarget.Read,
    ): Promise<InboundQuotesRequest[]> {
        return this.getRepository(target).find({where: {correlationId}});
    }

    async findByQuoteId(quoteId: string, target: DbTarget = DbTarget.Read): Promise<InboundQuotesRequest | null> {
        return this.getRepository(target).findOne({where: {quoteId}});
    }

    private getRepository(target: DbTarget): Repository<InboundQuotesRequest> {

        if (target === DbTarget.Write) {
            return this.writeRepository;
        }

        return this.readRepository;
    }
}
