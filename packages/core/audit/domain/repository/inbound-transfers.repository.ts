import {Injectable} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {DbTarget} from '@shared/typeorm';
import {Repository, SelectQueryBuilder} from 'typeorm';
import {InboundTransfers} from '../model';
import {FindInboundTransfersQuery} from '../query/find-inbound-transfers.query';
import {PIVOTAL_DB_READ_CONNECTION_NAME, PIVOTAL_DB_WRITE_CONNECTION_NAME} from './pivotal-connection-name';

@Injectable()
export class InboundTransfersRepository {

    private static readonly DEFAULT_PAGE = 0;
    private static readonly DEFAULT_SIZE = 20;

    constructor(
        @InjectRepository(InboundTransfers, PIVOTAL_DB_WRITE_CONNECTION_NAME)
        private readonly writeRepository: Repository<InboundTransfers>,
        @InjectRepository(InboundTransfers, PIVOTAL_DB_READ_CONNECTION_NAME)
        private readonly readRepository: Repository<InboundTransfers>,
    ) {
    }

    async save(entity: InboundTransfers): Promise<InboundTransfers> {
        return this.writeRepository.save(entity);
    }

    async findById(id: string, target: DbTarget = DbTarget.Read): Promise<InboundTransfers | null> {
        return this.getRepository(target).findOne({where: {id}});
    }

    async findByCorrelationId(correlationId: string, target: DbTarget = DbTarget.Read): Promise<InboundTransfers | null> {
        return this.getRepository(target).findOne({where: {correlationId}});
    }

    async findByTransferId(transferId: string, target: DbTarget = DbTarget.Read): Promise<InboundTransfers | null> {
        return this.getRepository(target).findOne({where: {transferId}});
    }

    async findInboundTransfers(
        criteria: FindInboundTransfersQuery.Criteria,
        pageRequest: FindInboundTransfersQuery.PageRequest,
        order: FindInboundTransfersQuery.Order,
        target: DbTarget = DbTarget.Read,
    ): Promise<FindInboundTransfersQuery.Output> {
        const repository = this.getRepository(target);
        const queryBuilder = repository.createQueryBuilder('inboundTransfers');

        this.applyCriteria(queryBuilder, criteria);
        this.applyOrdering(queryBuilder, order);
        const finalPageRequest = this.applyPagination(queryBuilder, pageRequest);

        const [records, totalRecords] = await queryBuilder.getManyAndCount();

        return new FindInboundTransfersQuery.Output(records, totalRecords, finalPageRequest);
    }

    private applyCriteria(
        queryBuilder: SelectQueryBuilder<InboundTransfers>,
        criteria: FindInboundTransfersQuery.Criteria,
    ): void {

        if (criteria.payerFsp !== undefined) {
            queryBuilder.andWhere('inboundTransfers.payerFsp = :payerFsp', {payerFsp: criteria.payerFsp});
        }

        if (criteria.payeeFsp !== undefined) {
            queryBuilder.andWhere('inboundTransfers.payeeFsp = :payeeFsp', {payeeFsp: criteria.payeeFsp});
        }

        if (criteria.transferId !== undefined) {
            queryBuilder.andWhere('inboundTransfers.transferId = :transferId', {transferId: criteria.transferId});
        }

        if (criteria.createdAt?.startInclusive !== undefined) {
            queryBuilder.andWhere('inboundTransfers.createdAt >= :createdAtStartInclusive', {
                createdAtStartInclusive: criteria.createdAt.startInclusive,
            });
        }

        if (criteria.createdAt?.endExclusive !== undefined) {
            queryBuilder.andWhere('inboundTransfers.createdAt < :createdAtEndExclusive', {
                createdAtEndExclusive: criteria.createdAt.endExclusive,
            });
        }

        if (criteria.completedAt?.startInclusive !== undefined) {
            queryBuilder.andWhere('inboundTransfers.completedAt >= :completedAtStartInclusive', {
                completedAtStartInclusive: criteria.completedAt.startInclusive,
            });
        }

        if (criteria.completedAt?.endExclusive !== undefined) {
            queryBuilder.andWhere('inboundTransfers.completedAt < :completedAtEndExclusive', {
                completedAtEndExclusive: criteria.completedAt.endExclusive,
            });
        }

        if (criteria.error !== undefined) {
            queryBuilder.andWhere('inboundTransfers.failed = :failed', {failed: criteria.error});
        }
    }

    private applyOrdering(
        queryBuilder: SelectQueryBuilder<InboundTransfers>,
        order: FindInboundTransfersQuery.Order,
    ): void {
        const orderColumn = InboundTransfersRepository.getOrderColumn(order.column);

        queryBuilder.orderBy(`inboundTransfers.${orderColumn}`, order.direction);
    }

    private applyPagination(
        queryBuilder: SelectQueryBuilder<InboundTransfers>,
        pageRequest: FindInboundTransfersQuery.PageRequest,
    ): FindInboundTransfersQuery.PageRequest {
        const page = InboundTransfersRepository.getPage(pageRequest.page);
        const size = InboundTransfersRepository.getSize(pageRequest.size);
        const offset = page * size;

        queryBuilder.skip(offset).take(size);

        return new FindInboundTransfersQuery.PageRequest(page, size);
    }

    private static getPage(page: number): number {

        if (page >= 0) {
            return page;
        }

        return InboundTransfersRepository.DEFAULT_PAGE;
    }

    private static getSize(size: number): number {

        if (size > 0) {
            return size;
        }

        return InboundTransfersRepository.DEFAULT_SIZE;
    }

    private static getOrderColumn(column: FindInboundTransfersQuery.Order.Column): string {

        switch (column) {
            case FindInboundTransfersQuery.Order.Column.Id:
                return 'id';
            case FindInboundTransfersQuery.Order.Column.PayerFsp:
                return 'payerFsp';
            case FindInboundTransfersQuery.Order.Column.PayeeFsp:
                return 'payeeFsp';
            case FindInboundTransfersQuery.Order.Column.TransferId:
                return 'transferId';
            case FindInboundTransfersQuery.Order.Column.CreatedAt:
                return 'createdAt';
            case FindInboundTransfersQuery.Order.Column.CompletedAt:
                return 'completedAt';
            case FindInboundTransfersQuery.Order.Column.Error:
                return 'failed';
            default:
                return 'createdAt';
        }
    }

    private getRepository(target: DbTarget): Repository<InboundTransfers> {

        if (target === DbTarget.Write) {
            return this.writeRepository;
        }

        return this.readRepository;
    }
}
