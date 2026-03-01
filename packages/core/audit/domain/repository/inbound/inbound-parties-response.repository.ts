import {Injectable} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {DbTarget} from '@shared/persistence';
import {Repository} from 'typeorm';
import {InboundPartiesResponse} from '../../model';
import {MTPA_DB_READ_CONNECTION_NAME, MTPA_DB_WRITE_CONNECTION_NAME} from '../mtpa-connection-name';

@Injectable()
export class InboundPartiesResponseRepository {

    constructor(
        @InjectRepository(InboundPartiesResponse, MTPA_DB_WRITE_CONNECTION_NAME)
        private readonly writeRepository: Repository<InboundPartiesResponse>,
        @InjectRepository(InboundPartiesResponse, MTPA_DB_READ_CONNECTION_NAME)
        private readonly readRepository: Repository<InboundPartiesResponse>,
    ) {
    }

    async save(entity: InboundPartiesResponse): Promise<InboundPartiesResponse> {
        return this.writeRepository.save(entity);
    }

    async findById(id: string, target: DbTarget = DbTarget.Read): Promise<InboundPartiesResponse | null> {
        return this.getRepository(target).findOne({where: {id}});
    }

    private getRepository(target: DbTarget): Repository<InboundPartiesResponse> {

        if (target === DbTarget.Write) {
            return this.writeRepository;
        }

        return this.readRepository;
    }
}
