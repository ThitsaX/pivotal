import {Injectable} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {DbTarget} from '@shared/persistence';
import {Repository} from 'typeorm';
import {OutboundQuotesResponse} from '../../model';
import {MTPA_DB_READ_CONNECTION_NAME, MTPA_DB_WRITE_CONNECTION_NAME} from '../mtpa-connection-name';

@Injectable()
export class OutboundQuotesResponseRepository {

    constructor(
        @InjectRepository(OutboundQuotesResponse, MTPA_DB_WRITE_CONNECTION_NAME)
        private readonly writeRepository: Repository<OutboundQuotesResponse>,
        @InjectRepository(OutboundQuotesResponse, MTPA_DB_READ_CONNECTION_NAME)
        private readonly readRepository: Repository<OutboundQuotesResponse>,
    ) {
    }

    async save(entity: OutboundQuotesResponse): Promise<OutboundQuotesResponse> {
        return this.writeRepository.save(entity);
    }

    async findById(id: string, target: DbTarget = DbTarget.Read): Promise<OutboundQuotesResponse | null> {
        return this.getRepository(target).findOne({where: {id}});
    }

    private getRepository(target: DbTarget): Repository<OutboundQuotesResponse> {

        if (target === DbTarget.Write) {
            return this.writeRepository;
        }

        return this.readRepository;
    }
}
