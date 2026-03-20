import {Injectable} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {DbTarget} from '@shared/typeorm';
import {Repository, SelectQueryBuilder} from 'typeorm';
import {InboundQuotes} from '../model';
import {FindInboundQuotesQuery} from '../query/find-inbound-quotes.query';
import {PIVOTAL_DB_READ_CONNECTION_NAME, PIVOTAL_DB_WRITE_CONNECTION_NAME} from './pivotal-connection-name';

@Injectable()
export class InboundQuotesRepository {

    private static readonly DEFAULT_PAGE = 0;
    private static readonly DEFAULT_SIZE = 20;

    constructor(
        @InjectRepository(InboundQuotes, PIVOTAL_DB_WRITE_CONNECTION_NAME)
        private readonly writeRepository: Repository<InboundQuotes>,
        @InjectRepository(InboundQuotes, PIVOTAL_DB_READ_CONNECTION_NAME)
        private readonly readRepository: Repository<InboundQuotes>,
    ) {
    }

    async save(entity: InboundQuotes): Promise<InboundQuotes> {
        return this.writeRepository.save(entity);
    }

    async findById(id: string, target: DbTarget = DbTarget.Read): Promise<InboundQuotes | null> {
        return this.getRepository(target).findOne({where: {id}});
    }

    async findByQuoteId(quoteId: string, target: DbTarget = DbTarget.Read): Promise<InboundQuotes | null> {
        return this.getRepository(target).findOne({where: {quoteId}});
    }

    async findInboundQuotes(
        criteria: FindInboundQuotesQuery.Criteria,
        pageRequest: FindInboundQuotesQuery.PageRequest,
        order: FindInboundQuotesQuery.Order,
        target: DbTarget = DbTarget.Read,
    ): Promise<FindInboundQuotesQuery.Output> {
        const repository = this.getRepository(target);
        const queryBuilder = repository.createQueryBuilder('inboundQuotes');

        this.applyCriteria(queryBuilder, criteria);
        this.applyOrdering(queryBuilder, order);
        const finalPageRequest = this.applyPagination(queryBuilder, pageRequest);

        const [records, totalRecords] = await queryBuilder.getManyAndCount();

        return new FindInboundQuotesQuery.Output(records, totalRecords, finalPageRequest);
    }

    private applyCriteria(
        queryBuilder: SelectQueryBuilder<InboundQuotes>,
        criteria: FindInboundQuotesQuery.Criteria,
    ): void {

        if (criteria.payerFsp !== undefined) {
            queryBuilder.andWhere('inboundQuotes.payerFsp = :payerFsp', {payerFsp: criteria.payerFsp});
        }

        if (criteria.payeeFsp !== undefined) {
            queryBuilder.andWhere('inboundQuotes.payeeFsp = :payeeFsp', {payeeFsp: criteria.payeeFsp});
        }

        if (criteria.quoteId !== undefined) {
            queryBuilder.andWhere('inboundQuotes.quoteId = :quoteId', {quoteId: criteria.quoteId});
        }

        if (criteria.scenario !== undefined) {
            queryBuilder.andWhere('inboundQuotes.scenario = :scenario', {scenario: criteria.scenario});
        }

        if (criteria.subScenario !== undefined) {
            queryBuilder.andWhere('inboundQuotes.subScenario = :subScenario', {subScenario: criteria.subScenario});
        }

        if (criteria.createdAt?.startInclusive !== undefined) {
            queryBuilder.andWhere('inboundQuotes.createdAt >= :createdAtStartInclusive', {
                createdAtStartInclusive: criteria.createdAt.startInclusive,
            });
        }

        if (criteria.createdAt?.endExclusive !== undefined) {
            queryBuilder.andWhere('inboundQuotes.createdAt < :createdAtEndExclusive', {
                createdAtEndExclusive: criteria.createdAt.endExclusive,
            });
        }

        if (criteria.completedAt?.startInclusive !== undefined) {
            queryBuilder.andWhere('inboundQuotes.completedAt >= :completedAtStartInclusive', {
                completedAtStartInclusive: criteria.completedAt.startInclusive,
            });
        }

        if (criteria.completedAt?.endExclusive !== undefined) {
            queryBuilder.andWhere('inboundQuotes.completedAt < :completedAtEndExclusive', {
                completedAtEndExclusive: criteria.completedAt.endExclusive,
            });
        }

        if (criteria.error !== undefined) {
            queryBuilder.andWhere('inboundQuotes.failed = :failed', {failed: criteria.error});
        }
    }

    private applyOrdering(
        queryBuilder: SelectQueryBuilder<InboundQuotes>,
        order: FindInboundQuotesQuery.Order,
    ): void {
        const orderColumn = InboundQuotesRepository.getOrderColumn(order.column);

        queryBuilder.orderBy(`inboundQuotes.${orderColumn}`, order.direction);
    }

    private applyPagination(
        queryBuilder: SelectQueryBuilder<InboundQuotes>,
        pageRequest: FindInboundQuotesQuery.PageRequest,
    ): FindInboundQuotesQuery.PageRequest {
        const page = InboundQuotesRepository.getPage(pageRequest.page);
        const size = InboundQuotesRepository.getSize(pageRequest.size);
        const offset = page * size;

        queryBuilder.skip(offset).take(size);

        return new FindInboundQuotesQuery.PageRequest(page, size);
    }

    private static getPage(page: number): number {

        if (page >= 0) {
            return page;
        }

        return InboundQuotesRepository.DEFAULT_PAGE;
    }

    private static getSize(size: number): number {

        if (size > 0) {
            return size;
        }

        return InboundQuotesRepository.DEFAULT_SIZE;
    }

    private static getOrderColumn(column: FindInboundQuotesQuery.Order.Column): string {

        switch (column) {
            case FindInboundQuotesQuery.Order.Column.Id:
                return 'id';
            case FindInboundQuotesQuery.Order.Column.PayerFsp:
                return 'payerFsp';
            case FindInboundQuotesQuery.Order.Column.PayeeFsp:
                return 'payeeFsp';
            case FindInboundQuotesQuery.Order.Column.QuoteId:
                return 'quoteId';
            case FindInboundQuotesQuery.Order.Column.CreatedAt:
                return 'createdAt';
            case FindInboundQuotesQuery.Order.Column.CompletedAt:
                return 'completedAt';
            case FindInboundQuotesQuery.Order.Column.Error:
                return 'failed';
            default:
                return 'createdAt';
        }
    }

    private getRepository(target: DbTarget): Repository<InboundQuotes> {

        if (target === DbTarget.Write) {
            return this.writeRepository;
        }

        return this.readRepository;
    }
}
