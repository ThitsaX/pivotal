import {Injectable} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {DbTarget} from '@shared/typeorm';
import {Repository, SelectQueryBuilder} from 'typeorm';
import {OutboundQuotes} from '../model';
import {FindOutboundQuotesQuery} from '../query/find-outbound-quotes.query';
import {PIVOTAL_DB_READ_CONNECTION_NAME, PIVOTAL_DB_WRITE_CONNECTION_NAME} from './pivotal-connection-name';

@Injectable()
export class OutboundQuotesRepository {

    private static readonly DEFAULT_PAGE = 0;
    private static readonly DEFAULT_SIZE = 20;

    constructor(
        @InjectRepository(OutboundQuotes, PIVOTAL_DB_WRITE_CONNECTION_NAME)
        private readonly writeRepository: Repository<OutboundQuotes>,
        @InjectRepository(OutboundQuotes, PIVOTAL_DB_READ_CONNECTION_NAME)
        private readonly readRepository: Repository<OutboundQuotes>,
    ) {
    }

    async save(entity: OutboundQuotes): Promise<OutboundQuotes> {
        return this.writeRepository.save(entity);
    }

    async findById(id: string, target: DbTarget = DbTarget.Read): Promise<OutboundQuotes | null> {
        return this.getRepository(target).findOne({where: {id}});
    }

    async findByQuoteId(quoteId: string, target: DbTarget = DbTarget.Read): Promise<OutboundQuotes | null> {
        return this.getRepository(target).findOne({where: {quoteId}});
    }

    async findOutboundQuotes(
        criteria: FindOutboundQuotesQuery.Criteria,
        pageRequest: FindOutboundQuotesQuery.PageRequest,
        order: FindOutboundQuotesQuery.Order,
        target: DbTarget = DbTarget.Read,
    ): Promise<FindOutboundQuotesQuery.Output> {
        const repository = this.getRepository(target);
        const queryBuilder = repository.createQueryBuilder('outboundQuotes');

        this.applyCriteria(queryBuilder, criteria);
        this.applyOrdering(queryBuilder, order);
        const finalPageRequest = this.applyPagination(queryBuilder, pageRequest);

        const [records, totalRecords] = await queryBuilder.getManyAndCount();

        return new FindOutboundQuotesQuery.Output(records, totalRecords, finalPageRequest);
    }

    private applyCriteria(
        queryBuilder: SelectQueryBuilder<OutboundQuotes>,
        criteria: FindOutboundQuotesQuery.Criteria,
    ): void {

        if (criteria.payerFsp !== undefined) {
            queryBuilder.andWhere('outboundQuotes.payerFsp = :payerFsp', {payerFsp: criteria.payerFsp});
        }

        if (criteria.payeeFsp !== undefined) {
            queryBuilder.andWhere('outboundQuotes.payeeFsp = :payeeFsp', {payeeFsp: criteria.payeeFsp});
        }

        if (criteria.quoteId !== undefined) {
            queryBuilder.andWhere('outboundQuotes.quoteId = :quoteId', {quoteId: criteria.quoteId});
        }

        if (criteria.scenario !== undefined) {
            queryBuilder.andWhere('outboundQuotes.scenario = :scenario', {scenario: criteria.scenario});
        }

        if (criteria.subScenario !== undefined) {
            queryBuilder.andWhere('outboundQuotes.subScenario = :subScenario', {subScenario: criteria.subScenario});
        }

        if (criteria.createdAt?.startInclusive !== undefined) {
            queryBuilder.andWhere('outboundQuotes.createdAt >= :createdAtStartInclusive', {
                createdAtStartInclusive: criteria.createdAt.startInclusive,
            });
        }

        if (criteria.createdAt?.endExclusive !== undefined) {
            queryBuilder.andWhere('outboundQuotes.createdAt < :createdAtEndExclusive', {
                createdAtEndExclusive: criteria.createdAt.endExclusive,
            });
        }

        if (criteria.completedAt?.startInclusive !== undefined) {
            queryBuilder.andWhere('outboundQuotes.completedAt >= :completedAtStartInclusive', {
                completedAtStartInclusive: criteria.completedAt.startInclusive,
            });
        }

        if (criteria.completedAt?.endExclusive !== undefined) {
            queryBuilder.andWhere('outboundQuotes.completedAt < :completedAtEndExclusive', {
                completedAtEndExclusive: criteria.completedAt.endExclusive,
            });
        }

        if (criteria.error !== undefined) {
            queryBuilder.andWhere('outboundQuotes.failed = :failed', {failed: criteria.error});
        }
    }

    private applyOrdering(
        queryBuilder: SelectQueryBuilder<OutboundQuotes>,
        order: FindOutboundQuotesQuery.Order,
    ): void {
        const orderColumn = OutboundQuotesRepository.getOrderColumn(order.column);

        queryBuilder.orderBy(`outboundQuotes.${orderColumn}`, order.direction);
    }

    private applyPagination(
        queryBuilder: SelectQueryBuilder<OutboundQuotes>,
        pageRequest: FindOutboundQuotesQuery.PageRequest,
    ): FindOutboundQuotesQuery.PageRequest {
        const page = OutboundQuotesRepository.getPage(pageRequest.page);
        const size = OutboundQuotesRepository.getSize(pageRequest.size);
        const offset = page * size;

        queryBuilder.skip(offset).take(size);

        return new FindOutboundQuotesQuery.PageRequest(page, size);
    }

    private static getPage(page: number): number {

        if (page >= 0) {
            return page;
        }

        return OutboundQuotesRepository.DEFAULT_PAGE;
    }

    private static getSize(size: number): number {

        if (size > 0) {
            return size;
        }

        return OutboundQuotesRepository.DEFAULT_SIZE;
    }

    private static getOrderColumn(column: FindOutboundQuotesQuery.Order.Column): string {

        switch (column) {
            case FindOutboundQuotesQuery.Order.Column.Id:
                return 'id';
            case FindOutboundQuotesQuery.Order.Column.PayerFsp:
                return 'payerFsp';
            case FindOutboundQuotesQuery.Order.Column.PayeeFsp:
                return 'payeeFsp';
            case FindOutboundQuotesQuery.Order.Column.QuoteId:
                return 'quoteId';
            case FindOutboundQuotesQuery.Order.Column.CreatedAt:
                return 'createdAt';
            case FindOutboundQuotesQuery.Order.Column.CompletedAt:
                return 'completedAt';
            case FindOutboundQuotesQuery.Order.Column.Error:
                return 'failed';
            default:
                return 'createdAt';
        }
    }

    private getRepository(target: DbTarget): Repository<OutboundQuotes> {

        if (target === DbTarget.Write) {
            return this.writeRepository;
        }

        return this.readRepository;
    }
}
