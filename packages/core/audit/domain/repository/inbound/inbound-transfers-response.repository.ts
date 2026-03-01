import {Injectable} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {DbTarget} from '@shared/persistence';
import {Repository} from 'typeorm';
import {InboundTransfersResponse} from '../../model';
import {MTPA_DB_READ_CONNECTION_NAME, MTPA_DB_WRITE_CONNECTION_NAME} from '../mtpa-connection-name';

@Injectable()
export class InboundTransfersResponseRepository {

    constructor(
        @InjectRepository(InboundTransfersResponse, MTPA_DB_WRITE_CONNECTION_NAME)
        private readonly writeRepository: Repository<InboundTransfersResponse>,
        @InjectRepository(InboundTransfersResponse, MTPA_DB_READ_CONNECTION_NAME)
        private readonly readRepository: Repository<InboundTransfersResponse>,
    ) {
    }

    async save(entity: InboundTransfersResponse): Promise<InboundTransfersResponse> {
        return this.writeRepository.save(entity);
    }

    async findById(id: string, target: DbTarget = DbTarget.Read): Promise<InboundTransfersResponse | null> {
        return this.getRepository(target).findOne({where: {id}});
    }

    private getRepository(target: DbTarget): Repository<InboundTransfersResponse> {

        if (target === DbTarget.Write) {
            return this.writeRepository;
        }

        return this.readRepository;
    }
}
