import {Injectable} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {DbTarget} from '@shared/typeorm';
import {Repository, SelectQueryBuilder} from 'typeorm';
import {OutboundParties} from '../model';
import {FindOutboundPartiesQuery} from '../query/find-outbound-parties.query';
import {PIVOTAL_DB_READ_CONNECTION_NAME, PIVOTAL_DB_WRITE_CONNECTION_NAME} from './pivotal-connection-name';

@Injectable()
export class OutboundPartiesRepository {

    private static readonly DEFAULT_PAGE = 0;
    private static readonly DEFAULT_SIZE = 20;

    constructor(
        @InjectRepository(OutboundParties, PIVOTAL_DB_WRITE_CONNECTION_NAME)
        private readonly writeRepository: Repository<OutboundParties>,
        @InjectRepository(OutboundParties, PIVOTAL_DB_READ_CONNECTION_NAME)
        private readonly readRepository: Repository<OutboundParties>,
    ) {
    }

    async save(entity: OutboundParties): Promise<OutboundParties> {
        return this.writeRepository.save(entity);
    }

    async findById(id: string, target: DbTarget = DbTarget.Read): Promise<OutboundParties | null> {
        return this.getRepository(target).findOne({where: {id}});
    }

    async findOutboundParties(
        criteria: FindOutboundPartiesQuery.Criteria,
        pageRequest: FindOutboundPartiesQuery.PageRequest,
        order: FindOutboundPartiesQuery.Order,
        target: DbTarget = DbTarget.Read,
    ): Promise<FindOutboundPartiesQuery.Output> {
        const repository = this.getRepository(target);
        const queryBuilder = repository.createQueryBuilder('outboundParties');

        this.applyCriteria(queryBuilder, criteria);
        this.applyOrdering(queryBuilder, order);
        const finalPageRequest = this.applyPagination(queryBuilder, pageRequest);

        const [records, totalRecords] = await queryBuilder.getManyAndCount();

        return new FindOutboundPartiesQuery.Output(records, totalRecords, finalPageRequest);
    }

    private applyCriteria(
        queryBuilder: SelectQueryBuilder<OutboundParties>,
        criteria: FindOutboundPartiesQuery.Criteria,
    ): void {

        if (criteria.payerFsp !== undefined) {
            queryBuilder.andWhere('outboundParties.payerFsp = :payerFsp', {payerFsp: criteria.payerFsp});
        }

        if (criteria.payeeFsp !== undefined) {
            queryBuilder.andWhere('outboundParties.payeeFsp = :payeeFsp', {payeeFsp: criteria.payeeFsp});
        }

        if (criteria.partyIdType !== undefined) {
            queryBuilder.andWhere('outboundParties.partyIdType = :partyIdType', {partyIdType: criteria.partyIdType});
        }

        if (criteria.partyId !== undefined) {
            queryBuilder.andWhere('outboundParties.partyId = :partyId', {partyId: criteria.partyId});
        }

        if (criteria.subId !== undefined) {

            if (criteria.subId === null) {
                queryBuilder.andWhere('outboundParties.subId IS NULL');
            } else {
                queryBuilder.andWhere('outboundParties.subId = :subId', {subId: criteria.subId});
            }
        }

        if (criteria.createdAt?.startInclusive !== undefined) {
            queryBuilder.andWhere('outboundParties.createdAt >= :createdAtStartInclusive', {
                createdAtStartInclusive: criteria.createdAt.startInclusive,
            });
        }

        if (criteria.createdAt?.endExclusive !== undefined) {
            queryBuilder.andWhere('outboundParties.createdAt < :createdAtEndExclusive', {
                createdAtEndExclusive: criteria.createdAt.endExclusive,
            });
        }

        if (criteria.completedAt?.startInclusive !== undefined) {
            queryBuilder.andWhere('outboundParties.completedAt >= :completedAtStartInclusive', {
                completedAtStartInclusive: criteria.completedAt.startInclusive,
            });
        }

        if (criteria.completedAt?.endExclusive !== undefined) {
            queryBuilder.andWhere('outboundParties.completedAt < :completedAtEndExclusive', {
                completedAtEndExclusive: criteria.completedAt.endExclusive,
            });
        }

        if (criteria.error !== undefined) {
            queryBuilder.andWhere('outboundParties.failed = :failed', {failed: criteria.error});
        }
    }

    private applyOrdering(
        queryBuilder: SelectQueryBuilder<OutboundParties>,
        order: FindOutboundPartiesQuery.Order,
    ): void {
        const orderColumn = OutboundPartiesRepository.getOrderColumn(order.column);

        queryBuilder.orderBy(`outboundParties.${orderColumn}`, order.direction);
    }

    private applyPagination(
        queryBuilder: SelectQueryBuilder<OutboundParties>,
        pageRequest: FindOutboundPartiesQuery.PageRequest,
    ): FindOutboundPartiesQuery.PageRequest {
        const page = OutboundPartiesRepository.getPage(pageRequest.page);
        const size = OutboundPartiesRepository.getSize(pageRequest.size);
        const offset = page * size;

        queryBuilder.skip(offset).take(size);

        return new FindOutboundPartiesQuery.PageRequest(page, size);
    }

    private static getPage(page: number): number {

        if (page >= 0) {
            return page;
        }

        return OutboundPartiesRepository.DEFAULT_PAGE;
    }

    private static getSize(size: number): number {

        if (size > 0) {
            return size;
        }

        return OutboundPartiesRepository.DEFAULT_SIZE;
    }

    private static getOrderColumn(column: FindOutboundPartiesQuery.Order.Column): string {

        switch (column) {
            case FindOutboundPartiesQuery.Order.Column.Id:
                return 'id';
            case FindOutboundPartiesQuery.Order.Column.PayerFsp:
                return 'payerFsp';
            case FindOutboundPartiesQuery.Order.Column.PayeeFsp:
                return 'payeeFsp';
            case FindOutboundPartiesQuery.Order.Column.PartyIdType:
                return 'partyIdType';
            case FindOutboundPartiesQuery.Order.Column.PartyId:
                return 'partyId';
            case FindOutboundPartiesQuery.Order.Column.SubId:
                return 'subId';
            case FindOutboundPartiesQuery.Order.Column.CreatedAt:
                return 'createdAt';
            case FindOutboundPartiesQuery.Order.Column.CompletedAt:
                return 'completedAt';
            case FindOutboundPartiesQuery.Order.Column.Error:
                return 'failed';
            default:
                return 'createdAt';
        }
    }

    private getRepository(target: DbTarget): Repository<OutboundParties> {

        if (target === DbTarget.Write) {
            return this.writeRepository;
        }

        return this.readRepository;
    }
}
