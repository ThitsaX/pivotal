import {Injectable} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {DbTarget} from '@shared/persistence';
import {Repository} from 'typeorm';
import {InboundQuotesResponse} from '../../model';
import {MTPA_DB_READ_CONNECTION_NAME, MTPA_DB_WRITE_CONNECTION_NAME} from '../mtpa-connection-name';

@Injectable()
export class InboundQuotesResponseRepository {

    constructor(
        @InjectRepository(InboundQuotesResponse, MTPA_DB_WRITE_CONNECTION_NAME)
        private readonly writeRepository: Repository<InboundQuotesResponse>,
        @InjectRepository(InboundQuotesResponse, MTPA_DB_READ_CONNECTION_NAME)
        private readonly readRepository: Repository<InboundQuotesResponse>,
    ) {
    }

    async save(entity: InboundQuotesResponse): Promise<InboundQuotesResponse> {
        return this.writeRepository.save(entity);
    }

    async findById(id: string, target: DbTarget = DbTarget.Read): Promise<InboundQuotesResponse | null> {
        return this.getRepository(target).findOne({where: {id}});
    }

    private getRepository(target: DbTarget): Repository<InboundQuotesResponse> {

        if (target === DbTarget.Write) {
            return this.writeRepository;
        }

        return this.readRepository;
    }
}
