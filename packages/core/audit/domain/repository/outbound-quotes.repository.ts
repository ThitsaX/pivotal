import {Injectable} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {DbTarget} from '@shared/typeorm';
import {Repository} from 'typeorm';
import {OutboundQuotes} from '../model';
import {PAYPORT_DB_READ_CONNECTION_NAME, PAYPORT_DB_WRITE_CONNECTION_NAME} from './payport-connection-name';

@Injectable()
export class OutboundQuotesRepository {

    constructor(
        @InjectRepository(OutboundQuotes, PAYPORT_DB_WRITE_CONNECTION_NAME)
        private readonly writeRepository: Repository<OutboundQuotes>,
        @InjectRepository(OutboundQuotes, PAYPORT_DB_READ_CONNECTION_NAME)
        private readonly readRepository: Repository<OutboundQuotes>,
    ) {
    }

    async save(entity: OutboundQuotes): Promise<OutboundQuotes> {
        return this.writeRepository.save(entity);
    }

    async findById(id: string, target: DbTarget = DbTarget.Read): Promise<OutboundQuotes | null> {
        return this.getRepository(target).findOne({where: {id}});
    }

    async findByQuoteId(quoteId: string, target: DbTarget = DbTarget.Read): Promise<OutboundQuotes | null> {
        return this.getRepository(target).findOne({where: {quoteId}});
    }

    private getRepository(target: DbTarget): Repository<OutboundQuotes> {

        if (target === DbTarget.Write) {
            return this.writeRepository;
        }

        return this.readRepository;
    }
}
