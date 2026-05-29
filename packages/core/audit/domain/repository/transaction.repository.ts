import {Injectable} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Currency, PartyIdType, TransactionInitiatorType, TransactionScenario, TransferState} from '@shared/fspiop';
import {Snowflake} from '@shared/snowflake';
import {DbTarget} from '@shared/typeorm';
import {Repository, SelectQueryBuilder} from 'typeorm';
import {Transaction} from '../model';
import {GetTransactionQuery} from '../query/get-transaction.query';
import {FindTransactionsQuery} from '../query/find-transactions.query';
import {PIVOTAL_DB_READ_CONNECTION_NAME, PIVOTAL_DB_WRITE_CONNECTION_NAME} from './pivotal-connection-name';

@Injectable()
export class TransactionRepository {

    private static readonly DEFAULT_PAGE = 0;
    private static readonly SNOWFLAKE = Snowflake.get();
    private static readonly DEFAULT_SIZE = 20;
    private static readonly JSON_REPLACER = (_key: string, value: unknown): unknown => {
        return typeof value === 'bigint' ? value.toString() : value;
    };

    constructor(
        @InjectRepository(Transaction, PIVOTAL_DB_WRITE_CONNECTION_NAME)
        private readonly writeRepository: Repository<Transaction>,
        @InjectRepository(Transaction, PIVOTAL_DB_READ_CONNECTION_NAME)
        private readonly readRepository: Repository<Transaction>,
    ) {
    }

    async save(entity: Transaction): Promise<Transaction> {
        return this.writeRepository.save(entity);
    }

    async upsert(input: TransactionRepository.UpsertInput): Promise<string> {
        const now = new Date();
        const values = [
            TransactionRepository.SNOWFLAKE.nextId().toString(),
            input.correlationId,
            input.payerFsp,
            input.payeeFsp,
            input.payerIdType ?? null,
            input.payerId ?? null,
            input.payerSubId ?? null,
            input.payeeIdType ?? null,
            input.payeeId ?? null,
            input.payeeSubId ?? null,
            input.transactionInitiatorType ?? null,
            input.quotingCurrency ?? null,
            input.quotingAmount ?? null,
            input.transferCurrency ?? null,
            input.transferAmount ?? null,
            input.transactionStartedAt,
            input.transactionCompletedAt ?? null,
            input.transactionType ?? null,
            input.subScenario ?? null,
            input.transferState ?? null,
            input.possibleDispute ?? false,
            input.error,
            input.flow ?? null,
            input.partiesRequestedAt ?? null,
            input.partiesRespondedAt ?? null,
            TransactionRepository.toJsonValue(input.partiesRequest),
            TransactionRepository.toJsonValue(input.partiesResponse),
            TransactionRepository.toJsonValue(input.partiesError),
            input.outboundPartiesRequestedAt ?? null,
            input.outboundPartiesRespondedAt ?? null,
            input.inboundPartiesRequestedAt ?? null,
            input.inboundPartiesRespondedAt ?? null,
            input.connectorPartiesRequestedAt ?? null,
            input.connectorPartiesRespondedAt ?? null,
            input.quotesRequestedAt ?? null,
            input.quotesRespondedAt ?? null,
            TransactionRepository.toJsonValue(input.quotesRequest),
            TransactionRepository.toJsonValue(input.quotesResponse),
            TransactionRepository.toJsonValue(input.quotesError),
            input.outboundQuotesRequestedAt ?? null,
            input.outboundQuotesRespondedAt ?? null,
            input.inboundQuotesRequestedAt ?? null,
            input.inboundQuotesRespondedAt ?? null,
            input.connectorQuotesRequestedAt ?? null,
            input.connectorQuotesRespondedAt ?? null,
            input.transfersRequestedAt ?? null,
            input.transfersRespondedAt ?? null,
            TransactionRepository.toJsonValue(input.transfersRequest),
            TransactionRepository.toJsonValue(input.transfersResponse),
            TransactionRepository.toJsonValue(input.transfersError),
            input.outboundTransfersRequestedAt ?? null,
            input.outboundTransfersRespondedAt ?? null,
            input.inboundTransfersRequestedAt ?? null,
            input.inboundTransfersRespondedAt ?? null,
            input.connectorTransfersRequestedAt ?? null,
            input.connectorTransfersRespondedAt ?? null,
            input.patchRequestedAt ?? null,
            input.patchRespondedAt ?? null,
            TransactionRepository.toJsonValue(input.patchRequest),
            input.patchError ?? null,
            input.createdAt ?? input.transactionStartedAt,
            now,
        ];
        const placeholders = values.map(() => '?').join(', ');

        // Use a single statement upsert so concurrent JetStream consumers do not race on read-before-write.
        await this.writeRepository.query(
            `INSERT INTO transactions (
                id,
                correlation_id,
                payer_fsp,
                payee_fsp,
                payer_id_type,
                payer_id,
                payer_sub_id,
                payee_id_type,
                payee_id,
                payee_sub_id,
                transaction_initiator_type,
                quoting_currency,
                quoting_amount,
                transfer_currency,
                transfer_amount,
                transaction_started_at,
                transaction_completed_at,
                transaction_type,
                sub_scenario,
                transfer_state,
                possible_dispute,
                error,
                flow,
                parties_requested_at,
                parties_responded_at,
                parties_request,
                parties_response,
                parties_error,
                outbound_parties_requested_at,
                outbound_parties_responded_at,
                inbound_parties_requested_at,
                inbound_parties_responded_at,
                connector_parties_requested_at,
                connector_parties_responded_at,
                quotes_requested_at,
                quotes_responded_at,
                quotes_request,
                quotes_response,
                quotes_error,
                outbound_quotes_requested_at,
                outbound_quotes_responded_at,
                inbound_quotes_requested_at,
                inbound_quotes_responded_at,
                connector_quotes_requested_at,
                connector_quotes_responded_at,
                transfers_requested_at,
                transfers_responded_at,
                transfers_request,
                transfers_response,
                transfers_error,
                outbound_transfers_requested_at,
                outbound_transfers_responded_at,
                inbound_transfers_requested_at,
                inbound_transfers_responded_at,
                connector_transfers_requested_at,
                connector_transfers_responded_at,
                patch_requested_at,
                patch_responded_at,
                patch_request,
                patch_error,
                created_at,
                updated_at
            ) VALUES (${placeholders})
            ON DUPLICATE KEY UPDATE
                payer_fsp = CASE
                    WHEN transactions.payer_id IS NOT NULL AND VALUES(payer_id) IS NULL THEN transactions.payer_fsp
                    ELSE VALUES(payer_fsp)
                END,
                payee_fsp = CASE
                    WHEN transactions.payee_id IS NOT NULL AND VALUES(payee_id) IS NULL THEN transactions.payee_fsp
                    ELSE VALUES(payee_fsp)
                END,
                payer_id_type = COALESCE(VALUES(payer_id_type), transactions.payer_id_type),
                payer_id = COALESCE(VALUES(payer_id), transactions.payer_id),
                payer_sub_id = COALESCE(VALUES(payer_sub_id), transactions.payer_sub_id),
                payee_id_type = COALESCE(VALUES(payee_id_type), transactions.payee_id_type),
                payee_id = COALESCE(VALUES(payee_id), transactions.payee_id),
                payee_sub_id = COALESCE(VALUES(payee_sub_id), transactions.payee_sub_id),
                transaction_initiator_type = COALESCE(
                    VALUES(transaction_initiator_type),
                    transactions.transaction_initiator_type
                ),
                quoting_currency = COALESCE(VALUES(quoting_currency), transactions.quoting_currency),
                quoting_amount = COALESCE(VALUES(quoting_amount), transactions.quoting_amount),
                transfer_currency = COALESCE(VALUES(transfer_currency), transactions.transfer_currency),
                transfer_amount = COALESCE(VALUES(transfer_amount), transactions.transfer_amount),
                transaction_started_at = LEAST(transactions.transaction_started_at, VALUES(transaction_started_at)),
                transaction_completed_at = COALESCE(
                    VALUES(transaction_completed_at),
                    transactions.transaction_completed_at
                ),
                transaction_type = COALESCE(VALUES(transaction_type), transactions.transaction_type),
                sub_scenario = COALESCE(VALUES(sub_scenario), transactions.sub_scenario),
                transfer_state = COALESCE(VALUES(transfer_state), transactions.transfer_state),
                possible_dispute = transactions.possible_dispute OR COALESCE(VALUES(possible_dispute), FALSE),
                error = transactions.error OR VALUES(error),
                flow = CASE
                    WHEN transactions.flow IS NULL THEN VALUES(flow)
                    WHEN VALUES(flow) IS NULL THEN transactions.flow
                    ELSE GREATEST(transactions.flow, VALUES(flow))
                END,
                parties_requested_at = CASE
                    WHEN transactions.parties_requested_at IS NULL THEN VALUES(parties_requested_at)
                    WHEN VALUES(parties_requested_at) IS NULL THEN transactions.parties_requested_at
                    ELSE LEAST(transactions.parties_requested_at, VALUES(parties_requested_at))
                END,
                parties_responded_at = CASE
                    WHEN transactions.parties_responded_at IS NULL THEN VALUES(parties_responded_at)
                    WHEN VALUES(parties_responded_at) IS NULL THEN transactions.parties_responded_at
                    ELSE GREATEST(transactions.parties_responded_at, VALUES(parties_responded_at))
                END,
                parties_request = COALESCE(VALUES(parties_request), transactions.parties_request),
                parties_response = COALESCE(VALUES(parties_response), transactions.parties_response),
                parties_error = COALESCE(VALUES(parties_error), transactions.parties_error),
                outbound_parties_requested_at = CASE
                    WHEN transactions.outbound_parties_requested_at IS NULL THEN VALUES(outbound_parties_requested_at)
                    WHEN VALUES(outbound_parties_requested_at) IS NULL THEN transactions.outbound_parties_requested_at
                    ELSE LEAST(transactions.outbound_parties_requested_at, VALUES(outbound_parties_requested_at))
                END,
                outbound_parties_responded_at = CASE
                    WHEN transactions.outbound_parties_responded_at IS NULL THEN VALUES(outbound_parties_responded_at)
                    WHEN VALUES(outbound_parties_responded_at) IS NULL THEN transactions.outbound_parties_responded_at
                    ELSE GREATEST(transactions.outbound_parties_responded_at, VALUES(outbound_parties_responded_at))
                END,
                inbound_parties_requested_at = CASE
                    WHEN transactions.inbound_parties_requested_at IS NULL THEN VALUES(inbound_parties_requested_at)
                    WHEN VALUES(inbound_parties_requested_at) IS NULL THEN transactions.inbound_parties_requested_at
                    ELSE LEAST(transactions.inbound_parties_requested_at, VALUES(inbound_parties_requested_at))
                END,
                inbound_parties_responded_at = CASE
                    WHEN transactions.inbound_parties_responded_at IS NULL THEN VALUES(inbound_parties_responded_at)
                    WHEN VALUES(inbound_parties_responded_at) IS NULL THEN transactions.inbound_parties_responded_at
                    ELSE GREATEST(transactions.inbound_parties_responded_at, VALUES(inbound_parties_responded_at))
                END,
                connector_parties_requested_at = CASE
                    WHEN transactions.connector_parties_requested_at IS NULL THEN VALUES(connector_parties_requested_at)
                    WHEN VALUES(connector_parties_requested_at) IS NULL THEN transactions.connector_parties_requested_at
                    ELSE LEAST(transactions.connector_parties_requested_at, VALUES(connector_parties_requested_at))
                END,
                connector_parties_responded_at = CASE
                    WHEN transactions.connector_parties_responded_at IS NULL THEN VALUES(connector_parties_responded_at)
                    WHEN VALUES(connector_parties_responded_at) IS NULL THEN transactions.connector_parties_responded_at
                    ELSE GREATEST(transactions.connector_parties_responded_at, VALUES(connector_parties_responded_at))
                END,
                quotes_requested_at = CASE
                    WHEN transactions.quotes_requested_at IS NULL THEN VALUES(quotes_requested_at)
                    WHEN VALUES(quotes_requested_at) IS NULL THEN transactions.quotes_requested_at
                    ELSE LEAST(transactions.quotes_requested_at, VALUES(quotes_requested_at))
                END,
                quotes_responded_at = CASE
                    WHEN transactions.quotes_responded_at IS NULL THEN VALUES(quotes_responded_at)
                    WHEN VALUES(quotes_responded_at) IS NULL THEN transactions.quotes_responded_at
                    ELSE GREATEST(transactions.quotes_responded_at, VALUES(quotes_responded_at))
                END,
                quotes_request = COALESCE(VALUES(quotes_request), transactions.quotes_request),
                quotes_response = COALESCE(VALUES(quotes_response), transactions.quotes_response),
                quotes_error = COALESCE(VALUES(quotes_error), transactions.quotes_error),
                outbound_quotes_requested_at = CASE
                    WHEN transactions.outbound_quotes_requested_at IS NULL THEN VALUES(outbound_quotes_requested_at)
                    WHEN VALUES(outbound_quotes_requested_at) IS NULL THEN transactions.outbound_quotes_requested_at
                    ELSE LEAST(transactions.outbound_quotes_requested_at, VALUES(outbound_quotes_requested_at))
                END,
                outbound_quotes_responded_at = CASE
                    WHEN transactions.outbound_quotes_responded_at IS NULL THEN VALUES(outbound_quotes_responded_at)
                    WHEN VALUES(outbound_quotes_responded_at) IS NULL THEN transactions.outbound_quotes_responded_at
                    ELSE GREATEST(transactions.outbound_quotes_responded_at, VALUES(outbound_quotes_responded_at))
                END,
                inbound_quotes_requested_at = CASE
                    WHEN transactions.inbound_quotes_requested_at IS NULL THEN VALUES(inbound_quotes_requested_at)
                    WHEN VALUES(inbound_quotes_requested_at) IS NULL THEN transactions.inbound_quotes_requested_at
                    ELSE LEAST(transactions.inbound_quotes_requested_at, VALUES(inbound_quotes_requested_at))
                END,
                inbound_quotes_responded_at = CASE
                    WHEN transactions.inbound_quotes_responded_at IS NULL THEN VALUES(inbound_quotes_responded_at)
                    WHEN VALUES(inbound_quotes_responded_at) IS NULL THEN transactions.inbound_quotes_responded_at
                    ELSE GREATEST(transactions.inbound_quotes_responded_at, VALUES(inbound_quotes_responded_at))
                END,
                connector_quotes_requested_at = CASE
                    WHEN transactions.connector_quotes_requested_at IS NULL THEN VALUES(connector_quotes_requested_at)
                    WHEN VALUES(connector_quotes_requested_at) IS NULL THEN transactions.connector_quotes_requested_at
                    ELSE LEAST(transactions.connector_quotes_requested_at, VALUES(connector_quotes_requested_at))
                END,
                connector_quotes_responded_at = CASE
                    WHEN transactions.connector_quotes_responded_at IS NULL THEN VALUES(connector_quotes_responded_at)
                    WHEN VALUES(connector_quotes_responded_at) IS NULL THEN transactions.connector_quotes_responded_at
                    ELSE GREATEST(transactions.connector_quotes_responded_at, VALUES(connector_quotes_responded_at))
                END,
                transfers_requested_at = CASE
                    WHEN transactions.transfers_requested_at IS NULL THEN VALUES(transfers_requested_at)
                    WHEN VALUES(transfers_requested_at) IS NULL THEN transactions.transfers_requested_at
                    ELSE LEAST(transactions.transfers_requested_at, VALUES(transfers_requested_at))
                END,
                transfers_responded_at = CASE
                    WHEN transactions.transfers_responded_at IS NULL THEN VALUES(transfers_responded_at)
                    WHEN VALUES(transfers_responded_at) IS NULL THEN transactions.transfers_responded_at
                    ELSE GREATEST(transactions.transfers_responded_at, VALUES(transfers_responded_at))
                END,
                transfers_request = COALESCE(VALUES(transfers_request), transactions.transfers_request),
                transfers_response = COALESCE(VALUES(transfers_response), transactions.transfers_response),
                transfers_error = COALESCE(VALUES(transfers_error), transactions.transfers_error),
                outbound_transfers_requested_at = CASE
                    WHEN transactions.outbound_transfers_requested_at IS NULL THEN VALUES(outbound_transfers_requested_at)
                    WHEN VALUES(outbound_transfers_requested_at) IS NULL THEN transactions.outbound_transfers_requested_at
                    ELSE LEAST(transactions.outbound_transfers_requested_at, VALUES(outbound_transfers_requested_at))
                END,
                outbound_transfers_responded_at = CASE
                    WHEN transactions.outbound_transfers_responded_at IS NULL THEN VALUES(outbound_transfers_responded_at)
                    WHEN VALUES(outbound_transfers_responded_at) IS NULL THEN transactions.outbound_transfers_responded_at
                    ELSE GREATEST(transactions.outbound_transfers_responded_at, VALUES(outbound_transfers_responded_at))
                END,
                inbound_transfers_requested_at = CASE
                    WHEN transactions.inbound_transfers_requested_at IS NULL THEN VALUES(inbound_transfers_requested_at)
                    WHEN VALUES(inbound_transfers_requested_at) IS NULL THEN transactions.inbound_transfers_requested_at
                    ELSE LEAST(transactions.inbound_transfers_requested_at, VALUES(inbound_transfers_requested_at))
                END,
                inbound_transfers_responded_at = CASE
                    WHEN transactions.inbound_transfers_responded_at IS NULL THEN VALUES(inbound_transfers_responded_at)
                    WHEN VALUES(inbound_transfers_responded_at) IS NULL THEN transactions.inbound_transfers_responded_at
                    ELSE GREATEST(transactions.inbound_transfers_responded_at, VALUES(inbound_transfers_responded_at))
                END,
                connector_transfers_requested_at = CASE
                    WHEN transactions.connector_transfers_requested_at IS NULL THEN VALUES(connector_transfers_requested_at)
                    WHEN VALUES(connector_transfers_requested_at) IS NULL THEN transactions.connector_transfers_requested_at
                    ELSE LEAST(transactions.connector_transfers_requested_at, VALUES(connector_transfers_requested_at))
                END,
                connector_transfers_responded_at = CASE
                    WHEN transactions.connector_transfers_responded_at IS NULL THEN VALUES(connector_transfers_responded_at)
                    WHEN VALUES(connector_transfers_responded_at) IS NULL THEN transactions.connector_transfers_responded_at
                    ELSE GREATEST(transactions.connector_transfers_responded_at, VALUES(connector_transfers_responded_at))
                END,
                patch_requested_at = CASE
                    WHEN transactions.patch_requested_at IS NULL THEN VALUES(patch_requested_at)
                    WHEN VALUES(patch_requested_at) IS NULL THEN transactions.patch_requested_at
                    ELSE LEAST(transactions.patch_requested_at, VALUES(patch_requested_at))
                END,
                patch_responded_at = CASE
                    WHEN transactions.patch_responded_at IS NULL THEN VALUES(patch_responded_at)
                    WHEN VALUES(patch_responded_at) IS NULL THEN transactions.patch_responded_at
                    ELSE GREATEST(transactions.patch_responded_at, VALUES(patch_responded_at))
                END,
                patch_request = COALESCE(VALUES(patch_request), transactions.patch_request),
                patch_error = COALESCE(VALUES(patch_error), transactions.patch_error),
                created_at = LEAST(transactions.created_at, VALUES(created_at)),
                updated_at = VALUES(updated_at)
            `,
            values,
        );

        const rows = await this.writeRepository.query(
            `SELECT id FROM transactions WHERE correlation_id = ? LIMIT 1`,
            [input.correlationId],
        );

        return rows[0]?.id ?? values[0];
    }

    private static toJsonValue(value: unknown | null | undefined): string | null {
        if (value == null) {
            return null;
        }

        return JSON.stringify(value, TransactionRepository.JSON_REPLACER);
    }

    async findByCorrelationId(correlationId: string, target: DbTarget = DbTarget.Read): Promise<Transaction | null> {
        return this.getRepository(target).findOne({where: {correlationId}});
    }

    async get(transferId: string, target: DbTarget = DbTarget.Read): Promise<Record<string, unknown> | null> {
        const record = await this.findByCorrelationId(transferId, target);

        return record == null ? null : TransactionRepository.toDetailRecord(record);
    }

    async dispute(correlationId: string): Promise<Transaction | null> {
        const existing = await this.findByCorrelationId(correlationId, DbTarget.Write);

        if (existing == null) {
            return null;
        }

        existing.possibleDispute = true;
        existing.updatedAt = new Date();

        return this.writeRepository.save(existing);
    }

    async find(
        criteria: FindTransactionsQuery.Criteria,
        pageRequest: FindTransactionsQuery.PageRequest,
        order: FindTransactionsQuery.Order,
        accessScope?: FindTransactionsQuery.AccessScope,
        target: DbTarget = DbTarget.Read,
    ): Promise<FindTransactionsQuery.Output> {
        const queryBuilder = this.getRepository(target).createQueryBuilder('transaction');

        this.applyCriteria(queryBuilder, criteria);
        this.applyAccessScope(queryBuilder, accessScope);
        this.applyOrdering(queryBuilder, order);
        const finalPageRequest = this.applyPagination(queryBuilder, pageRequest.page, pageRequest.size);
        const [records, totalRecords] = await queryBuilder.getManyAndCount();

        return new FindTransactionsQuery.Output(
            records.map((record) => TransactionRepository.toRecord(record)),
            totalRecords,
            new FindTransactionsQuery.PageRequest(finalPageRequest.page, finalPageRequest.size),
        );
    }

    async countForReport(
        criteria: FindTransactionsQuery.Criteria,
        accessScope?: FindTransactionsQuery.AccessScope,
        target: DbTarget = DbTarget.Read,
    ): Promise<number> {
        const queryBuilder = this.getRepository(target).createQueryBuilder('transaction');

        this.applyCriteria(queryBuilder, criteria);
        this.applyAccessScope(queryBuilder, accessScope);

        return queryBuilder.getCount();
    }

    async findForReport(
        criteria: FindTransactionsQuery.Criteria,
        order: FindTransactionsQuery.Order,
        offset: number,
        limit: number,
        accessScope?: FindTransactionsQuery.AccessScope,
        target: DbTarget = DbTarget.Read,
    ): Promise<Record<string, unknown>[]> {
        const queryBuilder = this.getRepository(target).createQueryBuilder('transaction');

        this.applyCriteria(queryBuilder, criteria);
        this.applyAccessScope(queryBuilder, accessScope);
        this.applyOrdering(queryBuilder, order);
        queryBuilder.skip(offset).take(limit);

        const records = await queryBuilder.getMany();

        return records.map((record) => TransactionRepository.toReportRecord(record));
    }

    private applyAccessScope(
        queryBuilder: SelectQueryBuilder<Transaction>,
        accessScope: FindTransactionsQuery.AccessScope | undefined,
    ): void {
        if (accessScope === undefined) {
            return;
        }

        queryBuilder.andWhere(
            '(transaction.payerFsp = :accessScopeFspId OR transaction.payeeFsp = :accessScopeFspId)',
            {accessScopeFspId: accessScope.fspId},
        );
    }

    private getRepository(target: DbTarget): Repository<Transaction> {

        if (target === DbTarget.Write) {
            return this.writeRepository;
        }

        return this.readRepository;
    }

    private applyCriteria(
        queryBuilder: SelectQueryBuilder<Transaction>,
        criteria: FindTransactionsQuery.Criteria,
    ): void {
        if (criteria.payerFsp !== undefined) {
            queryBuilder.andWhere('transaction.payerFsp = :payerFsp', {payerFsp: criteria.payerFsp});
        }

        if (criteria.payeeFsp !== undefined) {
            queryBuilder.andWhere('transaction.payeeFsp = :payeeFsp', {payeeFsp: criteria.payeeFsp});
        }

        if (criteria.payerIdType !== undefined) {
            queryBuilder.andWhere('transaction.payerIdType = :payerIdType', {payerIdType: criteria.payerIdType});
        }

        if (criteria.payerId !== undefined) {
            queryBuilder.andWhere('transaction.payerId = :payerId', {payerId: criteria.payerId});
        }

        if (criteria.payerSubId !== undefined) {
            if (criteria.payerSubId === null) {
                queryBuilder.andWhere('transaction.payerSubId IS NULL');
            } else {
                queryBuilder.andWhere('transaction.payerSubId = :payerSubId', {payerSubId: criteria.payerSubId});
            }
        }

        if (criteria.payeeIdType !== undefined) {
            queryBuilder.andWhere('transaction.payeeIdType = :payeeIdType', {payeeIdType: criteria.payeeIdType});
        }

        if (criteria.payeeId !== undefined) {
            queryBuilder.andWhere('transaction.payeeId = :payeeId', {payeeId: criteria.payeeId});
        }

        if (criteria.payeeSubId !== undefined) {
            if (criteria.payeeSubId === null) {
                queryBuilder.andWhere('transaction.payeeSubId IS NULL');
            } else {
                queryBuilder.andWhere('transaction.payeeSubId = :payeeSubId', {payeeSubId: criteria.payeeSubId});
            }
        }

        if (criteria.transferId !== undefined) {
            queryBuilder.andWhere('transaction.correlationId = :transferId', {transferId: criteria.transferId});
        }

        if (criteria.flow !== undefined) {
            queryBuilder.andWhere('transaction.flow = :flow', {flow: criteria.flow});
        }

        if (criteria.transferType !== undefined) {
            queryBuilder.andWhere('transaction.transactionType = :transferType', {transferType: criteria.transferType});
        }

        if (criteria.subScenario !== undefined) {
            queryBuilder.andWhere('transaction.subScenario = :subScenario', {subScenario: criteria.subScenario});
        }

        this.applyDateRange(
            queryBuilder,
            'transaction.transactionStartedAt',
            criteria.transactionStartAt,
            'transactionStartAt',
        );
        this.applyDateRange(
            queryBuilder,
            'transaction.transactionCompletedAt',
            criteria.transactionCompletedAt,
            'transactionCompletedAt',
        );

        if (criteria.error !== undefined) {
            queryBuilder.andWhere('transaction.error = :error', {error: criteria.error});
        }

        if (criteria.dispute !== undefined) {
            queryBuilder.andWhere('transaction.possibleDispute = :dispute', {dispute: criteria.dispute});
        }
    }

    private applyDateRange(
        queryBuilder: SelectQueryBuilder<Transaction>,
        column: string,
        range:
            | FindTransactionsQuery.DateRange
            | undefined,
        parameterPrefix: string,
    ): void {
        if (range?.startInclusive !== undefined) {
            queryBuilder.andWhere(`${column} >= :${parameterPrefix}StartInclusive`, {
                [`${parameterPrefix}StartInclusive`]: range.startInclusive,
            });
        }

        if (range?.endExclusive !== undefined) {
            queryBuilder.andWhere(`${column} < :${parameterPrefix}EndExclusive`, {
                [`${parameterPrefix}EndExclusive`]: range.endExclusive,
            });
        }
    }

    private applyOrdering(
        queryBuilder: SelectQueryBuilder<Transaction>,
        order: FindTransactionsQuery.Order,
    ): void {
        queryBuilder.orderBy(TransactionRepository.toOrderColumn(order.column), order.direction);
    }

    private applyPagination(
        queryBuilder: SelectQueryBuilder<Transaction>,
        page: number,
        size: number,
    ): {page: number; size: number} {
        const finalPage = page >= 0 ? page : TransactionRepository.DEFAULT_PAGE;
        const finalSize = size > 0 ? size : TransactionRepository.DEFAULT_SIZE;

        queryBuilder.skip(finalPage * finalSize).take(finalSize);

        return {page: finalPage, size: finalSize};
    }

    private static toOrderColumn(column: FindTransactionsQuery.Order.Column): string {
        switch (column) {
            case FindTransactionsQuery.Order.Column.Id:
                return 'transaction.id';
            case FindTransactionsQuery.Order.Column.CorrelationId:
                return 'transaction.correlationId';
            case FindTransactionsQuery.Order.Column.PayerFsp:
                return 'transaction.payerFsp';
            case FindTransactionsQuery.Order.Column.PayeeFsp:
                return 'transaction.payeeFsp';
            case FindTransactionsQuery.Order.Column.PayerId:
                return 'transaction.payerId';
            case FindTransactionsQuery.Order.Column.PayeeId:
                return 'transaction.payeeId';
            case FindTransactionsQuery.Order.Column.TransferType:
                return 'transaction.transactionType';
            case FindTransactionsQuery.Order.Column.SubScenario:
                return 'transaction.subScenario';
            case FindTransactionsQuery.Order.Column.TransactionCompletedAt:
                return 'transaction.transactionCompletedAt';
            case FindTransactionsQuery.Order.Column.Error:
                return 'transaction.error';
            case FindTransactionsQuery.Order.Column.Dispute:
                return 'transaction.possibleDispute';
            case FindTransactionsQuery.Order.Column.TransactionStartAt:
            default:
                return 'transaction.transactionStartedAt';
        }
    }

    private static toRecord(record: Transaction): Record<string, unknown> {
        return {
            id: record.id,
            correlationId: record.correlationId,
            payerFsp: record.payerFsp,
            payeeFsp: record.payeeFsp,
            payerIdType: record.payerIdType,
            payerId: record.payerId,
            payerSubId: record.payerSubId,
            payeeIdType: record.payeeIdType,
            payeeId: record.payeeId,
            payeeSubId: record.payeeSubId,
            transactionInitiatorType: record.transactionInitiatorType,
            quotingCurrency: record.quotingCurrency,
            quotingAmount: record.quotingAmount,
            transferCurrency: record.transferCurrency,
            transferAmount: record.transferAmount,
            transferType: record.transactionType,
            subScenario: record.subScenario,
            transferState: record.transferState,
            error: record.error,
            dispute: record.possibleDispute,
            flow: record.flow,
            transactionStartAt: record.transactionStartedAt,
            transactionCompletedAt: record.transactionCompletedAt,
        };
    }

    private static toDetailRecord(record: Transaction): Record<string, unknown> {
        return {
            id: record.id,
            transferId: record.correlationId,
            correlationId: record.correlationId,
            payerFsp: record.payerFsp,
            payeeFsp: record.payeeFsp,
            payerIdType: record.payerIdType,
            payerId: record.payerId,
            payerSubId: record.payerSubId,
            payeeIdType: record.payeeIdType,
            payeeId: record.payeeId,
            payeeSubId: record.payeeSubId,
            transactionInitiatorType: record.transactionInitiatorType,
            quotingCurrency: record.quotingCurrency,
            quotingAmount: record.quotingAmount,
            transferCurrency: record.transferCurrency,
            transferAmount: record.transferAmount,
            transactionType: record.transactionType,
            subScenario: record.subScenario,
            transferState: record.transferState,
            transactionStartedAt: record.transactionStartedAt,
            transactionCompletedAt: record.transactionCompletedAt,
            possibleDispute: record.possibleDispute,
            error: record.error,
            flow: record.flow,
            partiesRequestedAt: record.partiesRequestedAt,
            partiesRespondedAt: record.partiesRespondedAt,
            partiesRequest: record.partiesRequest,
            partiesResponse: record.partiesResponse,
            partiesError: record.partiesError,
            outboundPartiesRequestedAt: record.outboundPartiesRequestedAt,
            outboundPartiesRespondedAt: record.outboundPartiesRespondedAt,
            inboundPartiesRequestedAt: record.inboundPartiesRequestedAt,
            inboundPartiesRespondedAt: record.inboundPartiesRespondedAt,
            connectorPartiesRequestedAt: record.connectorPartiesRequestedAt,
            connectorPartiesRespondedAt: record.connectorPartiesRespondedAt,
            quotesRequestedAt: record.quotesRequestedAt,
            quotesRespondedAt: record.quotesRespondedAt,
            quotesRequest: record.quotesRequest,
            quotesResponse: record.quotesResponse,
            quotesError: record.quotesError,
            outboundQuotesRequestedAt: record.outboundQuotesRequestedAt,
            outboundQuotesRespondedAt: record.outboundQuotesRespondedAt,
            inboundQuotesRequestedAt: record.inboundQuotesRequestedAt,
            inboundQuotesRespondedAt: record.inboundQuotesRespondedAt,
            connectorQuotesRequestedAt: record.connectorQuotesRequestedAt,
            connectorQuotesRespondedAt: record.connectorQuotesRespondedAt,
            transfersRequestedAt: record.transfersRequestedAt,
            transfersRespondedAt: record.transfersRespondedAt,
            transfersRequest: record.transfersRequest,
            transfersResponse: record.transfersResponse,
            transfersError: record.transfersError,
            outboundTransfersRequestedAt: record.outboundTransfersRequestedAt,
            outboundTransfersRespondedAt: record.outboundTransfersRespondedAt,
            inboundTransfersRequestedAt: record.inboundTransfersRequestedAt,
            inboundTransfersRespondedAt: record.inboundTransfersRespondedAt,
            connectorTransfersRequestedAt: record.connectorTransfersRequestedAt,
            connectorTransfersRespondedAt: record.connectorTransfersRespondedAt,
            patchRequestedAt: record.patchRequestedAt,
            patchRespondedAt: record.patchRespondedAt,
            patchRequest: record.patchRequest,
            patchError: record.patchError,
            createdAt: record.createdAt,
            updatedAt: record.updatedAt,
        };
    }

    private static toReportRecord(record: Transaction): Record<string, unknown> {
        return {
            id: record.id,
            transferId: record.correlationId,
            payerFsp: record.payerFsp,
            payeeFsp: record.payeeFsp,
            payerIdType: record.payerIdType,
            payerId: record.payerId,
            payerSubId: record.payerSubId,
            payeeIdType: record.payeeIdType,
            payeeId: record.payeeId,
            payeeSubId: record.payeeSubId,
            transactionInitiatorType: record.transactionInitiatorType,
            quotingCurrency: record.quotingCurrency,
            quotingAmount: record.quotingAmount,
            transferCurrency: record.transferCurrency,
            transferAmount: record.transferAmount,
            transactionType: record.transactionType,
            subScenario: record.subScenario,
            transferState: record.transferState,
            error: record.error,
            dispute: record.possibleDispute,
            flow: record.flow,
            partiesRequestedAt: record.partiesRequestedAt,
            partiesRespondedAt: record.partiesRespondedAt,
            outboundPartiesRequestedAt: record.outboundPartiesRequestedAt,
            outboundPartiesRespondedAt: record.outboundPartiesRespondedAt,
            inboundPartiesRequestedAt: record.inboundPartiesRequestedAt,
            inboundPartiesRespondedAt: record.inboundPartiesRespondedAt,
            connectorPartiesRequestedAt: record.connectorPartiesRequestedAt,
            connectorPartiesRespondedAt: record.connectorPartiesRespondedAt,
            quotesRequestedAt: record.quotesRequestedAt,
            quotesRespondedAt: record.quotesRespondedAt,
            outboundQuotesRequestedAt: record.outboundQuotesRequestedAt,
            outboundQuotesRespondedAt: record.outboundQuotesRespondedAt,
            inboundQuotesRequestedAt: record.inboundQuotesRequestedAt,
            inboundQuotesRespondedAt: record.inboundQuotesRespondedAt,
            connectorQuotesRequestedAt: record.connectorQuotesRequestedAt,
            connectorQuotesRespondedAt: record.connectorQuotesRespondedAt,
            transfersRequestedAt: record.transfersRequestedAt,
            transfersRespondedAt: record.transfersRespondedAt,
            outboundTransfersRequestedAt: record.outboundTransfersRequestedAt,
            outboundTransfersRespondedAt: record.outboundTransfersRespondedAt,
            inboundTransfersRequestedAt: record.inboundTransfersRequestedAt,
            inboundTransfersRespondedAt: record.inboundTransfersRespondedAt,
            connectorTransfersRequestedAt: record.connectorTransfersRequestedAt,
            connectorTransfersRespondedAt: record.connectorTransfersRespondedAt,
            patchRequestedAt: record.patchRequestedAt,
            patchRespondedAt: record.patchRespondedAt,
            transactionStartedAt: record.transactionStartedAt,
            transactionCompletedAt: record.transactionCompletedAt,
            createdAt: record.createdAt,
            updatedAt: record.updatedAt,
        };
    }
}

export namespace TransactionRepository {

    export type UpsertInput = {
        correlationId: string;
        payerFsp: string;
        payeeFsp: string;
        payerIdType?: PartyIdType | null;
        payerId?: string | null;
        payerSubId?: string | null;
        payeeIdType?: PartyIdType | null;
        payeeId?: string | null;
        payeeSubId?: string | null;
        transactionInitiatorType?: TransactionInitiatorType | null;
        quotingCurrency?: Currency | null;
        quotingAmount?: number | null;
        transferCurrency?: Currency | null;
        transferAmount?: number | null;
        transactionStartedAt: Date;
        transactionCompletedAt?: Date | null;
        transactionType?: TransactionScenario | null;
        subScenario?: string | null;
        transferState?: TransferState | null;
        possibleDispute?: boolean | null;
        error: boolean;
        flow?: number | null;
        partiesRequestedAt?: Date | null;
        partiesRespondedAt?: Date | null;
        partiesRequest?: unknown | null;
        partiesResponse?: unknown | null;
        partiesError?: unknown | null;
        outboundPartiesRequestedAt?: Date | null;
        outboundPartiesRespondedAt?: Date | null;
        inboundPartiesRequestedAt?: Date | null;
        inboundPartiesRespondedAt?: Date | null;
        connectorPartiesRequestedAt?: Date | null;
        connectorPartiesRespondedAt?: Date | null;
        quotesRequestedAt?: Date | null;
        quotesRespondedAt?: Date | null;
        quotesRequest?: unknown | null;
        quotesResponse?: unknown | null;
        quotesError?: unknown | null;
        outboundQuotesRequestedAt?: Date | null;
        outboundQuotesRespondedAt?: Date | null;
        inboundQuotesRequestedAt?: Date | null;
        inboundQuotesRespondedAt?: Date | null;
        connectorQuotesRequestedAt?: Date | null;
        connectorQuotesRespondedAt?: Date | null;
        transfersRequestedAt?: Date | null;
        transfersRespondedAt?: Date | null;
        transfersRequest?: unknown | null;
        transfersResponse?: unknown | null;
        transfersError?: unknown | null;
        outboundTransfersRequestedAt?: Date | null;
        outboundTransfersRespondedAt?: Date | null;
        inboundTransfersRequestedAt?: Date | null;
        inboundTransfersRespondedAt?: Date | null;
        connectorTransfersRequestedAt?: Date | null;
        connectorTransfersRespondedAt?: Date | null;
        patchRequestedAt?: Date | null;
        patchRespondedAt?: Date | null;
        patchRequest?: unknown | null;
        patchError?: string | null;
        createdAt?: Date | null;
    };
}
