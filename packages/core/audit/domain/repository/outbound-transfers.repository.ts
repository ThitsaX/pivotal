import {Injectable} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {DbTarget} from '@shared/typeorm';
import {Repository, SelectQueryBuilder} from 'typeorm';
import {OutboundTransfers} from '../model';
import {FindOutboundTransfersQuery} from '../query/find-outbound-transfers.query';
import {PIVOTAL_DB_READ_CONNECTION_NAME, PIVOTAL_DB_WRITE_CONNECTION_NAME} from './pivotal-connection-name';

@Injectable()
export class OutboundTransfersRepository {

    private static readonly DEFAULT_PAGE = 0;
    private static readonly DEFAULT_SIZE = 20;

    constructor(
        @InjectRepository(OutboundTransfers, PIVOTAL_DB_WRITE_CONNECTION_NAME)
        private readonly writeRepository: Repository<OutboundTransfers>,
        @InjectRepository(OutboundTransfers, PIVOTAL_DB_READ_CONNECTION_NAME)
        private readonly readRepository: Repository<OutboundTransfers>,
    ) {
    }

    async save(entity: OutboundTransfers): Promise<OutboundTransfers> {
        return this.writeRepository.save(entity);
    }

    async findById(id: string, target: DbTarget = DbTarget.Read): Promise<OutboundTransfers | null> {
        return this.getRepository(target).findOne({where: {id}});
    }

    async findByCorrelationId(correlationId: string, target: DbTarget = DbTarget.Read): Promise<OutboundTransfers | null> {
        return this.getRepository(target).findOne({where: {correlationId}});
    }

    async findByTransferId(transferId: string, target: DbTarget = DbTarget.Read): Promise<OutboundTransfers | null> {
        return this.getRepository(target).findOne({where: {transferId}});
    }

    async findOutboundTransfers(
        criteria: FindOutboundTransfersQuery.Criteria,
        pageRequest: FindOutboundTransfersQuery.PageRequest,
        order: FindOutboundTransfersQuery.Order,
        target: DbTarget = DbTarget.Read,
    ): Promise<FindOutboundTransfersQuery.Output> {
        const repository = this.getRepository(target);
        const queryBuilder = repository.createQueryBuilder('outboundTransfers');

        this.applyCriteria(queryBuilder, criteria);
        this.applyOrdering(queryBuilder, order);
        const finalPageRequest = this.applyPagination(queryBuilder, pageRequest);

        const [records, totalRecords] = await queryBuilder.getManyAndCount();

        return new FindOutboundTransfersQuery.Output(records, totalRecords, finalPageRequest);
    }

    private applyCriteria(
        queryBuilder: SelectQueryBuilder<OutboundTransfers>,
        criteria: FindOutboundTransfersQuery.Criteria,
    ): void {

        if (criteria.payerFsp !== undefined) {
            queryBuilder.andWhere('outboundTransfers.payerFsp = :payerFsp', {payerFsp: criteria.payerFsp});
        }

        if (criteria.payeeFsp !== undefined) {
            queryBuilder.andWhere('outboundTransfers.payeeFsp = :payeeFsp', {payeeFsp: criteria.payeeFsp});
        }

        if (criteria.transferId !== undefined) {
            queryBuilder.andWhere('outboundTransfers.transferId = :transferId', {transferId: criteria.transferId});
        }

        if (criteria.createdAt?.startInclusive !== undefined) {
            queryBuilder.andWhere('outboundTransfers.createdAt >= :createdAtStartInclusive', {
                createdAtStartInclusive: criteria.createdAt.startInclusive,
            });
        }

        if (criteria.createdAt?.endExclusive !== undefined) {
            queryBuilder.andWhere('outboundTransfers.createdAt < :createdAtEndExclusive', {
                createdAtEndExclusive: criteria.createdAt.endExclusive,
            });
        }

        if (criteria.completedAt?.startInclusive !== undefined) {
            queryBuilder.andWhere('outboundTransfers.completedAt >= :completedAtStartInclusive', {
                completedAtStartInclusive: criteria.completedAt.startInclusive,
            });
        }

        if (criteria.completedAt?.endExclusive !== undefined) {
            queryBuilder.andWhere('outboundTransfers.completedAt < :completedAtEndExclusive', {
                completedAtEndExclusive: criteria.completedAt.endExclusive,
            });
        }

        if (criteria.error !== undefined) {
            queryBuilder.andWhere('outboundTransfers.failed = :failed', {failed: criteria.error});
        }
    }

    private applyOrdering(
        queryBuilder: SelectQueryBuilder<OutboundTransfers>,
        order: FindOutboundTransfersQuery.Order,
    ): void {
        const orderColumn = OutboundTransfersRepository.getOrderColumn(order.column);

        queryBuilder.orderBy(`outboundTransfers.${orderColumn}`, order.direction);
    }

    private applyPagination(
        queryBuilder: SelectQueryBuilder<OutboundTransfers>,
        pageRequest: FindOutboundTransfersQuery.PageRequest,
    ): FindOutboundTransfersQuery.PageRequest {
        const page = OutboundTransfersRepository.getPage(pageRequest.page);
        const size = OutboundTransfersRepository.getSize(pageRequest.size);
        const offset = page * size;

        queryBuilder.skip(offset).take(size);

        return new FindOutboundTransfersQuery.PageRequest(page, size);
    }

    private static getPage(page: number): number {

        if (page >= 0) {
            return page;
        }

        return OutboundTransfersRepository.DEFAULT_PAGE;
    }

    private static getSize(size: number): number {

        if (size > 0) {
            return size;
        }

        return OutboundTransfersRepository.DEFAULT_SIZE;
    }

    private static getOrderColumn(column: FindOutboundTransfersQuery.Order.Column): string {

        switch (column) {
            case FindOutboundTransfersQuery.Order.Column.Id:
                return 'id';
            case FindOutboundTransfersQuery.Order.Column.PayerFsp:
                return 'payerFsp';
            case FindOutboundTransfersQuery.Order.Column.PayeeFsp:
                return 'payeeFsp';
            case FindOutboundTransfersQuery.Order.Column.TransferId:
                return 'transferId';
            case FindOutboundTransfersQuery.Order.Column.CreatedAt:
                return 'createdAt';
            case FindOutboundTransfersQuery.Order.Column.CompletedAt:
                return 'completedAt';
            case FindOutboundTransfersQuery.Order.Column.Error:
                return 'failed';
            default:
                return 'createdAt';
        }
    }

    private getRepository(target: DbTarget): Repository<OutboundTransfers> {

        if (target === DbTarget.Write) {
            return this.writeRepository;
        }

        return this.readRepository;
    }
}
