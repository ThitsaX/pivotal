import {Injectable} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Currency, PartyIdType, TransactionInitiatorType, TransactionScenario, TransferState} from '@shared/fspiop';
import {Snowflake} from '@shared/snowflake';
import {DbTarget} from '@shared/typeorm';
import {Repository, SelectQueryBuilder} from 'typeorm';
import {Transaction} from '../model';
import {FindTransactionQuery} from '../query/find-transaction.query';
import {PIVOTAL_DB_READ_CONNECTION_NAME, PIVOTAL_DB_WRITE_CONNECTION_NAME} from './pivotal-connection-name';

@Injectable()
export class TransactionRepository {

    private static readonly DEFAULT_PAGE = 0;
    private static readonly SNOWFLAKE = Snowflake.get();
    private static readonly DEFAULT_SIZE = 20;

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
            input.partiesRequestedAt ?? null,
            input.partiesRespondedAt ?? null,
            input.partiesRequest ?? null,
            input.partiesResponse ?? null,
            input.partiesError ?? null,
            input.outboundPartiesRequestedAt ?? null,
            input.outboundPartiesRespondedAt ?? null,
            input.inboundPartiesRequestedAt ?? null,
            input.inboundPartiesRespondedAt ?? null,
            input.connectorPartiesRequestedAt ?? null,
            input.connectorPartiesRespondedAt ?? null,
            input.quotesRequestedAt ?? null,
            input.quotesRespondedAt ?? null,
            input.quotesRequest ?? null,
            input.quotesResponse ?? null,
            input.quotesError ?? null,
            input.outboundQuotesRequestedAt ?? null,
            input.outboundQuotesRespondedAt ?? null,
            input.inboundQuotesRequestedAt ?? null,
            input.inboundQuotesRespondedAt ?? null,
            input.connectorQuotesRequestedAt ?? null,
            input.connectorQuotesRespondedAt ?? null,
            input.transfersRequestedAt ?? null,
            input.transfersRespondedAt ?? null,
            input.transfersRequest ?? null,
            input.transfersResponse ?? null,
            input.transfersError ?? null,
            input.outboundTransfersRequestedAt ?? null,
            input.outboundTransfersRespondedAt ?? null,
            input.inboundTransfersRequestedAt ?? null,
            input.inboundTransfersRespondedAt ?? null,
            input.connectorTransfersRequestedAt ?? null,
            input.connectorTransfersRespondedAt ?? null,
            input.patchRequestedAt ?? null,
            input.patchRespondedAt ?? null,
            input.patchRequest ?? null,
            input.patchError ?? null,
            input.createdAt ?? input.transactionStartedAt,
            now,
        ];
        const placeholders = values.map((_, index) => `$${index + 1}`).join(', ');

        // Use a single statement upsert so concurrent JetStream consumers do not race on read-before-write.
        const rows = await this.writeRepository.query(
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
            ON CONFLICT (correlation_id) DO UPDATE SET
                payer_fsp = EXCLUDED.payer_fsp,
                payee_fsp = EXCLUDED.payee_fsp,
                payer_id_type = COALESCE(EXCLUDED.payer_id_type, transactions.payer_id_type),
                payer_id = COALESCE(EXCLUDED.payer_id, transactions.payer_id),
                payer_sub_id = COALESCE(EXCLUDED.payer_sub_id, transactions.payer_sub_id),
                payee_id_type = COALESCE(EXCLUDED.payee_id_type, transactions.payee_id_type),
                payee_id = COALESCE(EXCLUDED.payee_id, transactions.payee_id),
                payee_sub_id = COALESCE(EXCLUDED.payee_sub_id, transactions.payee_sub_id),
                transaction_initiator_type = COALESCE(
                    EXCLUDED.transaction_initiator_type,
                    transactions.transaction_initiator_type
                ),
                quoting_currency = COALESCE(EXCLUDED.quoting_currency, transactions.quoting_currency),
                quoting_amount = COALESCE(EXCLUDED.quoting_amount, transactions.quoting_amount),
                transfer_currency = COALESCE(EXCLUDED.transfer_currency, transactions.transfer_currency),
                transfer_amount = COALESCE(EXCLUDED.transfer_amount, transactions.transfer_amount),
                transaction_started_at = LEAST(transactions.transaction_started_at, EXCLUDED.transaction_started_at),
                transaction_completed_at = COALESCE(
                    EXCLUDED.transaction_completed_at,
                    transactions.transaction_completed_at
                ),
                transaction_type = COALESCE(EXCLUDED.transaction_type, transactions.transaction_type),
                sub_scenario = COALESCE(EXCLUDED.sub_scenario, transactions.sub_scenario),
                transfer_state = COALESCE(EXCLUDED.transfer_state, transactions.transfer_state),
                possible_dispute = transactions.possible_dispute OR COALESCE(EXCLUDED.possible_dispute, FALSE),
                error = transactions.error OR EXCLUDED.error,
                parties_requested_at = CASE
                    WHEN transactions.parties_requested_at IS NULL THEN EXCLUDED.parties_requested_at
                    WHEN EXCLUDED.parties_requested_at IS NULL THEN transactions.parties_requested_at
                    ELSE LEAST(transactions.parties_requested_at, EXCLUDED.parties_requested_at)
                END,
                parties_responded_at = CASE
                    WHEN transactions.parties_responded_at IS NULL THEN EXCLUDED.parties_responded_at
                    WHEN EXCLUDED.parties_responded_at IS NULL THEN transactions.parties_responded_at
                    ELSE GREATEST(transactions.parties_responded_at, EXCLUDED.parties_responded_at)
                END,
                parties_request = COALESCE(EXCLUDED.parties_request, transactions.parties_request),
                parties_response = COALESCE(EXCLUDED.parties_response, transactions.parties_response),
                parties_error = COALESCE(EXCLUDED.parties_error, transactions.parties_error),
                outbound_parties_requested_at = CASE
                    WHEN transactions.outbound_parties_requested_at IS NULL THEN EXCLUDED.outbound_parties_requested_at
                    WHEN EXCLUDED.outbound_parties_requested_at IS NULL THEN transactions.outbound_parties_requested_at
                    ELSE LEAST(transactions.outbound_parties_requested_at, EXCLUDED.outbound_parties_requested_at)
                END,
                outbound_parties_responded_at = CASE
                    WHEN transactions.outbound_parties_responded_at IS NULL THEN EXCLUDED.outbound_parties_responded_at
                    WHEN EXCLUDED.outbound_parties_responded_at IS NULL THEN transactions.outbound_parties_responded_at
                    ELSE GREATEST(transactions.outbound_parties_responded_at, EXCLUDED.outbound_parties_responded_at)
                END,
                inbound_parties_requested_at = CASE
                    WHEN transactions.inbound_parties_requested_at IS NULL THEN EXCLUDED.inbound_parties_requested_at
                    WHEN EXCLUDED.inbound_parties_requested_at IS NULL THEN transactions.inbound_parties_requested_at
                    ELSE LEAST(transactions.inbound_parties_requested_at, EXCLUDED.inbound_parties_requested_at)
                END,
                inbound_parties_responded_at = CASE
                    WHEN transactions.inbound_parties_responded_at IS NULL THEN EXCLUDED.inbound_parties_responded_at
                    WHEN EXCLUDED.inbound_parties_responded_at IS NULL THEN transactions.inbound_parties_responded_at
                    ELSE GREATEST(transactions.inbound_parties_responded_at, EXCLUDED.inbound_parties_responded_at)
                END,
                connector_parties_requested_at = CASE
                    WHEN transactions.connector_parties_requested_at IS NULL THEN EXCLUDED.connector_parties_requested_at
                    WHEN EXCLUDED.connector_parties_requested_at IS NULL THEN transactions.connector_parties_requested_at
                    ELSE LEAST(transactions.connector_parties_requested_at, EXCLUDED.connector_parties_requested_at)
                END,
                connector_parties_responded_at = CASE
                    WHEN transactions.connector_parties_responded_at IS NULL THEN EXCLUDED.connector_parties_responded_at
                    WHEN EXCLUDED.connector_parties_responded_at IS NULL THEN transactions.connector_parties_responded_at
                    ELSE GREATEST(transactions.connector_parties_responded_at, EXCLUDED.connector_parties_responded_at)
                END,
                quotes_requested_at = CASE
                    WHEN transactions.quotes_requested_at IS NULL THEN EXCLUDED.quotes_requested_at
                    WHEN EXCLUDED.quotes_requested_at IS NULL THEN transactions.quotes_requested_at
                    ELSE LEAST(transactions.quotes_requested_at, EXCLUDED.quotes_requested_at)
                END,
                quotes_responded_at = CASE
                    WHEN transactions.quotes_responded_at IS NULL THEN EXCLUDED.quotes_responded_at
                    WHEN EXCLUDED.quotes_responded_at IS NULL THEN transactions.quotes_responded_at
                    ELSE GREATEST(transactions.quotes_responded_at, EXCLUDED.quotes_responded_at)
                END,
                quotes_request = COALESCE(EXCLUDED.quotes_request, transactions.quotes_request),
                quotes_response = COALESCE(EXCLUDED.quotes_response, transactions.quotes_response),
                quotes_error = COALESCE(EXCLUDED.quotes_error, transactions.quotes_error),
                outbound_quotes_requested_at = CASE
                    WHEN transactions.outbound_quotes_requested_at IS NULL THEN EXCLUDED.outbound_quotes_requested_at
                    WHEN EXCLUDED.outbound_quotes_requested_at IS NULL THEN transactions.outbound_quotes_requested_at
                    ELSE LEAST(transactions.outbound_quotes_requested_at, EXCLUDED.outbound_quotes_requested_at)
                END,
                outbound_quotes_responded_at = CASE
                    WHEN transactions.outbound_quotes_responded_at IS NULL THEN EXCLUDED.outbound_quotes_responded_at
                    WHEN EXCLUDED.outbound_quotes_responded_at IS NULL THEN transactions.outbound_quotes_responded_at
                    ELSE GREATEST(transactions.outbound_quotes_responded_at, EXCLUDED.outbound_quotes_responded_at)
                END,
                inbound_quotes_requested_at = CASE
                    WHEN transactions.inbound_quotes_requested_at IS NULL THEN EXCLUDED.inbound_quotes_requested_at
                    WHEN EXCLUDED.inbound_quotes_requested_at IS NULL THEN transactions.inbound_quotes_requested_at
                    ELSE LEAST(transactions.inbound_quotes_requested_at, EXCLUDED.inbound_quotes_requested_at)
                END,
                inbound_quotes_responded_at = CASE
                    WHEN transactions.inbound_quotes_responded_at IS NULL THEN EXCLUDED.inbound_quotes_responded_at
                    WHEN EXCLUDED.inbound_quotes_responded_at IS NULL THEN transactions.inbound_quotes_responded_at
                    ELSE GREATEST(transactions.inbound_quotes_responded_at, EXCLUDED.inbound_quotes_responded_at)
                END,
                connector_quotes_requested_at = CASE
                    WHEN transactions.connector_quotes_requested_at IS NULL THEN EXCLUDED.connector_quotes_requested_at
                    WHEN EXCLUDED.connector_quotes_requested_at IS NULL THEN transactions.connector_quotes_requested_at
                    ELSE LEAST(transactions.connector_quotes_requested_at, EXCLUDED.connector_quotes_requested_at)
                END,
                connector_quotes_responded_at = CASE
                    WHEN transactions.connector_quotes_responded_at IS NULL THEN EXCLUDED.connector_quotes_responded_at
                    WHEN EXCLUDED.connector_quotes_responded_at IS NULL THEN transactions.connector_quotes_responded_at
                    ELSE GREATEST(transactions.connector_quotes_responded_at, EXCLUDED.connector_quotes_responded_at)
                END,
                transfers_requested_at = CASE
                    WHEN transactions.transfers_requested_at IS NULL THEN EXCLUDED.transfers_requested_at
                    WHEN EXCLUDED.transfers_requested_at IS NULL THEN transactions.transfers_requested_at
                    ELSE LEAST(transactions.transfers_requested_at, EXCLUDED.transfers_requested_at)
                END,
                transfers_responded_at = CASE
                    WHEN transactions.transfers_responded_at IS NULL THEN EXCLUDED.transfers_responded_at
                    WHEN EXCLUDED.transfers_responded_at IS NULL THEN transactions.transfers_responded_at
                    ELSE GREATEST(transactions.transfers_responded_at, EXCLUDED.transfers_responded_at)
                END,
                transfers_request = COALESCE(EXCLUDED.transfers_request, transactions.transfers_request),
                transfers_response = COALESCE(EXCLUDED.transfers_response, transactions.transfers_response),
                transfers_error = COALESCE(EXCLUDED.transfers_error, transactions.transfers_error),
                outbound_transfers_requested_at = CASE
                    WHEN transactions.outbound_transfers_requested_at IS NULL THEN EXCLUDED.outbound_transfers_requested_at
                    WHEN EXCLUDED.outbound_transfers_requested_at IS NULL THEN transactions.outbound_transfers_requested_at
                    ELSE LEAST(transactions.outbound_transfers_requested_at, EXCLUDED.outbound_transfers_requested_at)
                END,
                outbound_transfers_responded_at = CASE
                    WHEN transactions.outbound_transfers_responded_at IS NULL THEN EXCLUDED.outbound_transfers_responded_at
                    WHEN EXCLUDED.outbound_transfers_responded_at IS NULL THEN transactions.outbound_transfers_responded_at
                    ELSE GREATEST(transactions.outbound_transfers_responded_at, EXCLUDED.outbound_transfers_responded_at)
                END,
                inbound_transfers_requested_at = CASE
                    WHEN transactions.inbound_transfers_requested_at IS NULL THEN EXCLUDED.inbound_transfers_requested_at
                    WHEN EXCLUDED.inbound_transfers_requested_at IS NULL THEN transactions.inbound_transfers_requested_at
                    ELSE LEAST(transactions.inbound_transfers_requested_at, EXCLUDED.inbound_transfers_requested_at)
                END,
                inbound_transfers_responded_at = CASE
                    WHEN transactions.inbound_transfers_responded_at IS NULL THEN EXCLUDED.inbound_transfers_responded_at
                    WHEN EXCLUDED.inbound_transfers_responded_at IS NULL THEN transactions.inbound_transfers_responded_at
                    ELSE GREATEST(transactions.inbound_transfers_responded_at, EXCLUDED.inbound_transfers_responded_at)
                END,
                connector_transfers_requested_at = CASE
                    WHEN transactions.connector_transfers_requested_at IS NULL THEN EXCLUDED.connector_transfers_requested_at
                    WHEN EXCLUDED.connector_transfers_requested_at IS NULL THEN transactions.connector_transfers_requested_at
                    ELSE LEAST(transactions.connector_transfers_requested_at, EXCLUDED.connector_transfers_requested_at)
                END,
                connector_transfers_responded_at = CASE
                    WHEN transactions.connector_transfers_responded_at IS NULL THEN EXCLUDED.connector_transfers_responded_at
                    WHEN EXCLUDED.connector_transfers_responded_at IS NULL THEN transactions.connector_transfers_responded_at
                    ELSE GREATEST(transactions.connector_transfers_responded_at, EXCLUDED.connector_transfers_responded_at)
                END,
                patch_requested_at = CASE
                    WHEN transactions.patch_requested_at IS NULL THEN EXCLUDED.patch_requested_at
                    WHEN EXCLUDED.patch_requested_at IS NULL THEN transactions.patch_requested_at
                    ELSE LEAST(transactions.patch_requested_at, EXCLUDED.patch_requested_at)
                END,
                patch_responded_at = CASE
                    WHEN transactions.patch_responded_at IS NULL THEN EXCLUDED.patch_responded_at
                    WHEN EXCLUDED.patch_responded_at IS NULL THEN transactions.patch_responded_at
                    ELSE GREATEST(transactions.patch_responded_at, EXCLUDED.patch_responded_at)
                END,
                patch_request = COALESCE(EXCLUDED.patch_request, transactions.patch_request),
                patch_error = COALESCE(EXCLUDED.patch_error, transactions.patch_error),
                created_at = LEAST(transactions.created_at, EXCLUDED.created_at),
                updated_at = EXCLUDED.updated_at
            RETURNING id`,
            values,
        );

        return rows[0]?.id ?? values[0];
    }

    async findByCorrelationId(correlationId: string, target: DbTarget = DbTarget.Read): Promise<Transaction | null> {
        return this.getRepository(target).findOne({where: {correlationId}});
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
        criteria: FindTransactionQuery.Criteria,
        pageRequest: FindTransactionQuery.PageRequest,
        order: FindTransactionQuery.Order,
        target: DbTarget = DbTarget.Read,
    ): Promise<FindTransactionQuery.Output> {
        const queryBuilder = this.getRepository(target).createQueryBuilder('transaction');

        this.applyCriteria(queryBuilder, criteria);
        this.applyOrdering(queryBuilder, order);
        const finalPageRequest = this.applyPagination(queryBuilder, pageRequest.page, pageRequest.size);
        const [records, totalRecords] = await queryBuilder.getManyAndCount();

        return new FindTransactionQuery.Output(
            records.map((record) => TransactionRepository.toRecord(record)),
            totalRecords,
            new FindTransactionQuery.PageRequest(finalPageRequest.page, finalPageRequest.size),
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
        criteria: FindTransactionQuery.Criteria,
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
            | FindTransactionQuery.DateRange
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
        order: FindTransactionQuery.Order,
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

    private static toOrderColumn(column: FindTransactionQuery.Order.Column): string {
        switch (column) {
            case FindTransactionQuery.Order.Column.Id:
                return 'transaction.id';
            case FindTransactionQuery.Order.Column.CorrelationId:
                return 'transaction.correlationId';
            case FindTransactionQuery.Order.Column.PayerFsp:
                return 'transaction.payerFsp';
            case FindTransactionQuery.Order.Column.PayeeFsp:
                return 'transaction.payeeFsp';
            case FindTransactionQuery.Order.Column.PayerId:
                return 'transaction.payerId';
            case FindTransactionQuery.Order.Column.PayeeId:
                return 'transaction.payeeId';
            case FindTransactionQuery.Order.Column.TransferType:
                return 'transaction.transactionType';
            case FindTransactionQuery.Order.Column.SubScenario:
                return 'transaction.subScenario';
            case FindTransactionQuery.Order.Column.TransactionCompletedAt:
                return 'transaction.transactionCompletedAt';
            case FindTransactionQuery.Order.Column.Error:
                return 'transaction.error';
            case FindTransactionQuery.Order.Column.Dispute:
                return 'transaction.possibleDispute';
            case FindTransactionQuery.Order.Column.TransactionStartAt:
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
            dispute: record.possibleDispute,
            failed: record.error,
            transactionStartAt: record.transactionStartedAt,
            transactionCompletedAt: record.transactionCompletedAt,
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
