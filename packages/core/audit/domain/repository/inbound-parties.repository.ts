import {Injectable} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {DbTarget} from '@shared/typeorm';
import {Repository, SelectQueryBuilder} from 'typeorm';
import {InboundParties} from '../model';
import {FindInboundPartiesQuery} from '../query/find-inbound-parties.query';
import {PIVOTAL_DB_READ_CONNECTION_NAME, PIVOTAL_DB_WRITE_CONNECTION_NAME} from './pivotal-connection-name';

@Injectable()
export class InboundPartiesRepository {

    private static readonly DEFAULT_PAGE = 0;

    private static readonly DEFAULT_SIZE = 20;

    constructor(
        @InjectRepository(InboundParties, PIVOTAL_DB_WRITE_CONNECTION_NAME)
        private readonly writeRepository: Repository<InboundParties>,
        @InjectRepository(InboundParties, PIVOTAL_DB_READ_CONNECTION_NAME)
        private readonly readRepository: Repository<InboundParties>,
    ) {
    }

    private static getPage(page: number): number {

        if (page >= 0) {
            return page;
        }

        return InboundPartiesRepository.DEFAULT_PAGE;
    }

    private static getSize(size: number): number {

        if (size > 0) {
            return size;
        }

        return InboundPartiesRepository.DEFAULT_SIZE;
    }

    private static getOrderColumn(column: FindInboundPartiesQuery.Order.Column): string {

        switch (column) {
            case FindInboundPartiesQuery.Order.Column.Id:
                return 'id';
            case FindInboundPartiesQuery.Order.Column.PayerFsp:
                return 'payerFsp';
            case FindInboundPartiesQuery.Order.Column.PayeeFsp:
                return 'payeeFsp';
            case FindInboundPartiesQuery.Order.Column.PartyIdType:
                return 'partyIdType';
            case FindInboundPartiesQuery.Order.Column.PartyId:
                return 'partyId';
            case FindInboundPartiesQuery.Order.Column.SubId:
                return 'subId';
            case FindInboundPartiesQuery.Order.Column.CreatedAt:
                return 'createdAt';
            case FindInboundPartiesQuery.Order.Column.CompletedAt:
                return 'completedAt';
            case FindInboundPartiesQuery.Order.Column.Error:
                return 'failed';
            default:
                return 'createdAt';
        }
    }

    async save(entity: InboundParties): Promise<InboundParties> {
        return this.writeRepository.save(entity);
    }

    async findById(id: string, target: DbTarget = DbTarget.Read): Promise<InboundParties | null> {
        return this.getRepository(target).findOne({where: {id}});
    }

    async findByCorrelationId(correlationId: string, target: DbTarget = DbTarget.Read): Promise<InboundParties | null> {
        return this.getRepository(target).findOne({where: {correlationId}});
    }

    async findInboundParties(
        criteria: FindInboundPartiesQuery.Criteria,
        pageRequest: FindInboundPartiesQuery.PageRequest,
        order: FindInboundPartiesQuery.Order,
        target: DbTarget = DbTarget.Read,
    ): Promise<FindInboundPartiesQuery.Output> {
        const repository = this.getRepository(target);
        const queryBuilder = repository.createQueryBuilder('inboundParties');

        this.applyCriteria(queryBuilder, criteria);
        this.applyOrdering(queryBuilder, order);
        const finalPageRequest = this.applyPagination(queryBuilder, pageRequest);

        const [records, totalRecords] = await queryBuilder.getManyAndCount();

        return new FindInboundPartiesQuery.Output(records, totalRecords, finalPageRequest);
    }

    private applyCriteria(
        queryBuilder: SelectQueryBuilder<InboundParties>,
        criteria: FindInboundPartiesQuery.Criteria,
    ): void {

        if (criteria.payerFsp !== undefined) {
            queryBuilder.andWhere('inboundParties.payerFsp = :payerFsp', {payerFsp: criteria.payerFsp});
        }

        if (criteria.payeeFsp !== undefined) {
            queryBuilder.andWhere('inboundParties.payeeFsp = :payeeFsp', {payeeFsp: criteria.payeeFsp});
        }

        if (criteria.partyIdType !== undefined) {
            queryBuilder.andWhere('inboundParties.partyIdType = :partyIdType', {partyIdType: criteria.partyIdType});
        }

        if (criteria.partyId !== undefined) {
            queryBuilder.andWhere('inboundParties.partyId = :partyId', {partyId: criteria.partyId});
        }

        if (criteria.subId !== undefined) {

            if (criteria.subId === null) {
                queryBuilder.andWhere('inboundParties.subId IS NULL');
            } else {
                queryBuilder.andWhere('inboundParties.subId = :subId', {subId: criteria.subId});
            }
        }

        if (criteria.createdAt?.startInclusive !== undefined) {
            queryBuilder.andWhere('inboundParties.createdAt >= :createdAtStartInclusive', {
                createdAtStartInclusive: criteria.createdAt.startInclusive,
            });
        }

        if (criteria.createdAt?.endExclusive !== undefined) {
            queryBuilder.andWhere('inboundParties.createdAt < :createdAtEndExclusive', {
                createdAtEndExclusive: criteria.createdAt.endExclusive,
            });
        }

        if (criteria.completedAt?.startInclusive !== undefined) {
            queryBuilder.andWhere('inboundParties.completedAt >= :completedAtStartInclusive', {
                completedAtStartInclusive: criteria.completedAt.startInclusive,
            });
        }

        if (criteria.completedAt?.endExclusive !== undefined) {
            queryBuilder.andWhere('inboundParties.completedAt < :completedAtEndExclusive', {
                completedAtEndExclusive: criteria.completedAt.endExclusive,
            });
        }

        if (criteria.error !== undefined) {
            queryBuilder.andWhere('inboundParties.failed = :failed', {failed: criteria.error});
        }
    }

    private applyOrdering(
        queryBuilder: SelectQueryBuilder<InboundParties>,
        order: FindInboundPartiesQuery.Order,
    ): void {
        const orderColumn = InboundPartiesRepository.getOrderColumn(order.column);

        queryBuilder.orderBy(`inboundParties.${orderColumn}`, order.direction);
    }

    private applyPagination(
        queryBuilder: SelectQueryBuilder<InboundParties>,
        pageRequest: FindInboundPartiesQuery.PageRequest,
    ): FindInboundPartiesQuery.PageRequest {
        const page = InboundPartiesRepository.getPage(pageRequest.page);
        const size = InboundPartiesRepository.getSize(pageRequest.size);
        const offset = page * size;

        queryBuilder.skip(offset).take(size);

        return new FindInboundPartiesQuery.PageRequest(page, size);
    }

    private getRepository(target: DbTarget): Repository<InboundParties> {

        if (target === DbTarget.Write) {
            return this.writeRepository;
        }

        return this.readRepository;
    }
}
