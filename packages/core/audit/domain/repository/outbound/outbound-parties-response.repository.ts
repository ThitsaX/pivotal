import {Injectable} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {DbTarget} from '@shared/persistence';
import {Repository} from 'typeorm';
import {OutboundPartiesResponse} from '../../model';
import {MTPA_DB_READ_CONNECTION_NAME, MTPA_DB_WRITE_CONNECTION_NAME} from '../mtpa-connection-name';

@Injectable()
export class OutboundPartiesResponseRepository {

    constructor(
        @InjectRepository(OutboundPartiesResponse, MTPA_DB_WRITE_CONNECTION_NAME)
        private readonly writeRepository: Repository<OutboundPartiesResponse>,
        @InjectRepository(OutboundPartiesResponse, MTPA_DB_READ_CONNECTION_NAME)
        private readonly readRepository: Repository<OutboundPartiesResponse>,
    ) {
    }

    async save(entity: OutboundPartiesResponse): Promise<OutboundPartiesResponse> {
        return this.writeRepository.save(entity);
    }

    async findById(id: string, target: DbTarget = DbTarget.Read): Promise<OutboundPartiesResponse | null> {
        return this.getRepository(target).findOne({where: {id}});
    }

    private getRepository(target: DbTarget): Repository<OutboundPartiesResponse> {

        if (target === DbTarget.Write) {
            return this.writeRepository;
        }

        return this.readRepository;
    }
}
