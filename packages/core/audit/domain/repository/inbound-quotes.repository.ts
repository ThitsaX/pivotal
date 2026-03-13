import {Injectable} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {DbTarget} from '@shared/typeorm';
import {Repository} from 'typeorm';
import {InboundQuotes} from '../model';
import {PIVOTAL_DB_READ_CONNECTION_NAME, PIVOTAL_DB_WRITE_CONNECTION_NAME} from './pivotal-connection-name';

@Injectable()
export class InboundQuotesRepository {

    constructor(
        @InjectRepository(InboundQuotes, PIVOTAL_DB_WRITE_CONNECTION_NAME)
        private readonly writeRepository: Repository<InboundQuotes>,
        @InjectRepository(InboundQuotes, PIVOTAL_DB_READ_CONNECTION_NAME)
        private readonly readRepository: Repository<InboundQuotes>,
    ) {
    }

    async save(entity: InboundQuotes): Promise<InboundQuotes> {
        return this.writeRepository.save(entity);
    }

    async findById(id: string, target: DbTarget = DbTarget.Read): Promise<InboundQuotes | null> {
        return this.getRepository(target).findOne({where: {id}});
    }

    async findByQuoteId(quoteId: string, target: DbTarget = DbTarget.Read): Promise<InboundQuotes | null> {
        return this.getRepository(target).findOne({where: {quoteId}});
    }

    private getRepository(target: DbTarget): Repository<InboundQuotes> {

        if (target === DbTarget.Write) {
            return this.writeRepository;
        }

        return this.readRepository;
    }
}
