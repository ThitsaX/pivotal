import {Injectable} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {DbTarget} from '@shared/persistence';
import {Repository} from 'typeorm';
import {OutboundTransfersResponse} from '../../model';
import {MTPA_DB_READ_CONNECTION_NAME, MTPA_DB_WRITE_CONNECTION_NAME} from '../mtpa-connection-name';

@Injectable()
export class OutboundTransfersResponseRepository {

    constructor(
        @InjectRepository(OutboundTransfersResponse, MTPA_DB_WRITE_CONNECTION_NAME)
        private readonly writeRepository: Repository<OutboundTransfersResponse>,
        @InjectRepository(OutboundTransfersResponse, MTPA_DB_READ_CONNECTION_NAME)
        private readonly readRepository: Repository<OutboundTransfersResponse>,
    ) {
    }

    async save(entity: OutboundTransfersResponse): Promise<OutboundTransfersResponse> {
        return this.writeRepository.save(entity);
    }

    async findById(id: string, target: DbTarget = DbTarget.Read): Promise<OutboundTransfersResponse | null> {
        return this.getRepository(target).findOne({where: {id}});
    }

    private getRepository(target: DbTarget): Repository<OutboundTransfersResponse> {

        if (target === DbTarget.Write) {
            return this.writeRepository;
        }

        return this.readRepository;
    }
}
