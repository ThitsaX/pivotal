// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {BadRequestException, Injectable} from '@nestjs/common';
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

    private static readonly SNOWFLAKE = Snowflake.get();
    private static readonly DEFAULT_SIZE = 20;
    private static readonly MAX_SIZE = 200;
    private static readonly JSON_REPLACER = (_key: string, value: unknown): unknown => {
        return typeof value === 'bigint' ? value.toString() : value;
    };

    // Flat list columns only — never the JSON blobs (parties/quotes/transfers/patch),
    // which are read solely by the single-row detail view.
    private static readonly LIST_SELECT = [
        'transaction.id',
        'transaction.correlationId',
        'transaction.payerFsp',
        'transaction.payeeFsp',
        'transaction.payerIdType',
        'transaction.payerId',
        'transaction.payerSubId',
        'transaction.payeeIdType',
        'transaction.payeeId',
        'transaction.payeeSubId',
        'transaction.transactionInitiatorType',
        'transaction.quotingCurrency',
        'transaction.quotingAmount',
        'transaction.transferCurrency',
        'transaction.transferAmount',
        'transaction.payeeReceiveAmount',
        'transaction.payeeFee',
        'transaction.payerFee',
        'transaction.schemeFee',
        'transaction.transactionType',
        'transaction.subScenario',
        'transaction.transferState',
        'transaction.error',
        'transaction.possibleDispute',
        'transaction.flow',
        'transaction.transactionStartedAt',
        'transaction.transactionCompletedAt',
    ];

    private static readonly REPORT_SELECT = [
        'transaction.id',
        'transaction.correlationId',
        'transaction.payerFsp',
        'transaction.payeeFsp',
        'transaction.payerIdType',
        'transaction.payerId',
        'transaction.payerSubId',
        'transaction.payerHomeTransactionId',
        'transaction.payeeIdType',
        'transaction.payeeId',
        'transaction.payeeSubId',
        'transaction.payeeHomeTransactionId',
        'transaction.quotingCurrency',
        'transaction.quotingAmount',
        'transaction.payeeReceiveAmount',
        'transaction.transferAmount',
        'transaction.payeeFee',
        'transaction.payerFee',
        'transaction.schemeFee',
        'transaction.transferState',
        'transaction.possibleDispute',
        'transaction.partiesError',
        'transaction.quotesError',
        'transaction.transfersError',
        'transaction.patchError',
        'transaction.transactionStartedAt',
        'transaction.transactionCompletedAt',
    ];

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
            input.payeeReceiveAmount ?? null,
            input.payeeFee ?? null,
            input.payerFee ?? null,
            input.schemeFee ?? null,
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
            input.payerHomeTransactionId ?? null,
            input.payeeHomeTransactionId ?? null,
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
                payee_receive_amount,
                payee_fee,
                payer_fee,
                scheme_fee,
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
                payer_home_transaction_id,
                payee_home_transaction_id,
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
                payee_receive_amount = COALESCE(
                    VALUES(payee_receive_amount),
                    transactions.payee_receive_amount
                ),
                payee_fee = COALESCE(VALUES(payee_fee), transactions.payee_fee),
                payer_fee = COALESCE(VALUES(payer_fee), transactions.payer_fee),
                scheme_fee = COALESCE(VALUES(scheme_fee), transactions.scheme_fee),
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
                payer_home_transaction_id = COALESCE(
                    VALUES(payer_home_transaction_id),
                    transactions.payer_home_transaction_id
                ),
                payee_home_transaction_id = COALESCE(
                    VALUES(payee_home_transaction_id),
                    transactions.payee_home_transaction_id
                ),
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

    /**
     * Keyset (cursor) pagination. Replaces offset + getManyAndCount + select-*.
     *
     * - Sorts on `(sortColumn, id)`; the Snowflake `id` is the unique tiebreaker.
     * - Fetches `size + 1` rows to derive `hasNext`/`hasPrev` with no `COUNT(*)`.
     * - DFSP access scope `(payer OR payee = :fspId)` is run as two index-seekable legs
     *   and merged in memory (UNION semantics) instead of an OR that defeats the index.
     */
    async find(
        criteria: FindTransactionsQuery.Criteria,
        cursor: FindTransactionsQuery.Cursor,
        order: FindTransactionsQuery.Order,
        accessScope?: FindTransactionsQuery.AccessScope,
        target: DbTarget = DbTarget.Read,
    ): Promise<FindTransactionsQuery.Output> {
        const meta = TransactionRepository.sortMeta(order.column);
        const size = TransactionRepository.clampSize(cursor.size);
        const position = cursor.position;

        const reverse =
            position === FindTransactionsQuery.Cursor.Position.Prev ||
            position === FindTransactionsQuery.Cursor.Position.Last;
        const baseDir: 'ASC' | 'DESC' =
            order.direction === FindTransactionsQuery.Order.Direction.Asc ? 'ASC' : 'DESC';
        const effectiveDir: 'ASC' | 'DESC' = reverse ? (baseDir === 'DESC' ? 'ASC' : 'DESC') : baseDir;

        const usesToken =
            position === FindTransactionsQuery.Cursor.Position.Next ||
            position === FindTransactionsQuery.Cursor.Position.Prev;
        const decoded =
            usesToken && cursor.token != null ? TransactionRepository.decodeCursor(cursor.token) : undefined;

        const fetchLimit = size + 1;
        let rows: Transaction[];

        if (accessScope !== undefined) {
            const [payerLeg, payeeLeg] = await Promise.all([
                this.fetchLeg(criteria, meta, effectiveDir, decoded, fetchLimit, target, {
                    property: 'transaction.payerFsp',
                    fspId: accessScope.fspId,
                }),
                this.fetchLeg(criteria, meta, effectiveDir, decoded, fetchLimit, target, {
                    property: 'transaction.payeeFsp',
                    fspId: accessScope.fspId,
                }),
            ]);
            rows = TransactionRepository.mergeLegs(payerLeg, payeeLeg, meta, effectiveDir, fetchLimit);
        } else {
            rows = await this.fetchLeg(criteria, meta, effectiveDir, decoded, fetchLimit, target, undefined);
        }

        const hasMore = rows.length > size;
        let page = hasMore ? rows.slice(0, size) : rows;

        if (reverse) {
            page = page.reverse();
        }

        return new FindTransactionsQuery.Output(
            page.map((record) => TransactionRepository.toRecord(record)),
            TransactionRepository.buildPageInfo(position, hasMore, page, meta),
        );
    }

    /**
     * Count matching rows, capped at `maxLimit`. Index-only probe (`LIMIT maxLimit + 1`):
     * the `+1` is the over-limit signal, so the scan never reads past the cap. DFSP scope
     * counts the UNION (dedup by id) of the payer ∪ payee legs.
     */
    async count(
        criteria: FindTransactionsQuery.Criteria,
        maxLimit: number,
        accessScope?: FindTransactionsQuery.AccessScope,
        target: DbTarget = DbTarget.Read,
    ): Promise<{count: number; capped: boolean}> {
        const probeLimit = maxLimit + 1;

        const buildProbe = (legProperty?: string): [string, unknown[]] => {
            const queryBuilder = this.getRepository(target)
                                     .createQueryBuilder('transaction')
                                     .select('transaction.id', 'id');
            this.applyCriteria(queryBuilder, criteria);

            if (legProperty !== undefined && accessScope !== undefined) {
                queryBuilder.andWhere(`${legProperty} = :accessScopeFspId`, {
                    accessScopeFspId: accessScope.fspId,
                });
            }

            queryBuilder.limit(probeLimit);

            return queryBuilder.getQueryAndParameters();
        };

        let sql: string;
        let params: unknown[];

        if (accessScope !== undefined) {
            const [payerSql, payerParams] = buildProbe('transaction.payerFsp');
            const [payeeSql, payeeParams] = buildProbe('transaction.payeeFsp');
            sql = `SELECT COUNT(*) AS c FROM ((${payerSql}) UNION (${payeeSql})) u`;
            params = [...payerParams, ...payeeParams];
        } else {
            const [probeSql, probeParams] = buildProbe();
            sql = `SELECT COUNT(*) AS c FROM (${probeSql}) t`;
            params = probeParams;
        }

        const result = await this.getRepository(target).query(sql, params);
        const matched = Number(result[0]?.c ?? 0);

        return {count: Math.min(matched, maxLimit), capped: matched > maxLimit};
    }

    async countForReport(
        criteria: FindTransactionsQuery.Criteria,
        maxLimit: number,
        accessScope?: FindTransactionsQuery.AccessScope,
        target: DbTarget = DbTarget.Read,
    ): Promise<{count: number; capped: boolean}> {
        return this.count(criteria, maxLimit, accessScope, target);
    }

    async findForReport(
        criteria: FindTransactionsQuery.Criteria,
        order: FindTransactionsQuery.Order,
        cursorToken: string | undefined,
        limit: number,
        accessScope?: FindTransactionsQuery.AccessScope,
        target: DbTarget = DbTarget.Read,
    ): Promise<TransactionRepository.ReportPage> {
        const meta = TransactionRepository.sortMeta(order.column);
        const effectiveDir: 'ASC' | 'DESC' =
            order.direction === FindTransactionsQuery.Order.Direction.Asc ? 'ASC' : 'DESC';
        const decoded = cursorToken == null ? undefined : TransactionRepository.decodeCursor(cursorToken);
        const fetchLimit = Math.max(1, Math.trunc(limit)) + 1;
        let rows: Transaction[];

        if (accessScope !== undefined) {
            const [payerLeg, payeeLeg] = await Promise.all([
                this.fetchReportLeg(criteria, meta, effectiveDir, decoded, fetchLimit, target, {
                    property: 'transaction.payerFsp',
                    fspId: accessScope.fspId,
                }),
                this.fetchReportLeg(criteria, meta, effectiveDir, decoded, fetchLimit, target, {
                    property: 'transaction.payeeFsp',
                    fspId: accessScope.fspId,
                }),
            ]);
            rows = TransactionRepository.mergeLegs(payerLeg, payeeLeg, meta, effectiveDir, fetchLimit);
        } else {
            rows = await this.fetchReportLeg(criteria, meta, effectiveDir, decoded, fetchLimit, target, undefined);
        }

        const hasMore = rows.length >= fetchLimit;
        const page = hasMore ? rows.slice(0, fetchLimit - 1) : rows;
        const nextCursor = hasMore && page.length > 0
            ? TransactionRepository.encodeCursor(page[page.length - 1], meta)
            : undefined;

        return {
            records: page.map((record) => TransactionRepository.toReportRecord(record)),
            nextCursor,
        };
    }

    /**
     * Runs ONE index-seekable keyset query and returns up to `fetchLimit` (= size + 1) rows.
     *
     * This is the single building block for every page: it applies the search criteria, the
     * keyset "beyond the cursor" predicate (when paging), the sort `(sortColumn, id)` and the
     * `LIMIT` — selecting only the flat list columns (never the JSON blobs).
     *
     * `leg` scopes the query to one FSP column:
     *   - `undefined`          → HUB / unscoped (single query over the whole table).
     *   - `{payerFsp = :fsp}`  → the DFSP "payer leg".
     *   - `{payeeFsp = :fsp}`  → the DFSP "payee leg".
     * For a DFSP caller `find()` runs the payer leg and the payee leg separately (each hitting
     * its own composite index) and hands both to {@link mergeLegs}, instead of a single
     * `(payerFsp OR payeeFsp)` query that cannot use either index.
     */
    private async fetchLeg(
        criteria: FindTransactionsQuery.Criteria,
        meta: TransactionRepository.SortMeta,
        effectiveDir: 'ASC' | 'DESC',
        decoded: TransactionRepository.DecodedCursor | undefined,
        fetchLimit: number,
        target: DbTarget,
        leg: {property: string; fspId: string} | undefined,
    ): Promise<Transaction[]> {
        const queryBuilder = this.getRepository(target)
                                 .createQueryBuilder('transaction')
                                 .select(TransactionRepository.LIST_SELECT);

        this.applyCriteria(queryBuilder, criteria);

        if (leg !== undefined) {
            queryBuilder.andWhere(`${leg.property} = :accessScopeFspId`, {accessScopeFspId: leg.fspId});
        }

        if (decoded !== undefined) {
            const keyset = TransactionRepository.keysetWhere(meta, effectiveDir, decoded);
            queryBuilder.andWhere(keyset.sql, keyset.params);
        }

        queryBuilder
            .orderBy(meta.property, effectiveDir)
            .addOrderBy('transaction.id', effectiveDir)
            .limit(fetchLimit);

        return queryBuilder.getMany();
    }

    private async fetchReportLeg(
        criteria: FindTransactionsQuery.Criteria,
        meta: TransactionRepository.SortMeta,
        effectiveDir: 'ASC' | 'DESC',
        decoded: TransactionRepository.DecodedCursor | undefined,
        fetchLimit: number,
        target: DbTarget,
        leg: {property: string; fspId: string} | undefined,
    ): Promise<Transaction[]> {
        const queryBuilder = this.getRepository(target)
                                 .createQueryBuilder('transaction')
                                 .select(TransactionRepository.REPORT_SELECT);

        this.applyCriteria(queryBuilder, criteria);

        if (leg !== undefined) {
            queryBuilder.andWhere(`${leg.property} = :accessScopeFspId`, {accessScopeFspId: leg.fspId});
        }

        if (decoded !== undefined) {
            const keyset = TransactionRepository.keysetWhere(meta, effectiveDir, decoded);
            queryBuilder.andWhere(keyset.sql, keyset.params);
        }

        queryBuilder
            .orderBy(meta.property, effectiveDir)
            .addOrderBy('transaction.id', effectiveDir)
            .limit(fetchLimit);

        return queryBuilder.getMany();
    }

    private static sortMeta(column: FindTransactionsQuery.Order.Column): TransactionRepository.SortMeta {
        switch (column) {
            case FindTransactionsQuery.Order.Column.CorrelationId:
                return {
                    property: 'transaction.correlationId',
                    entityField: 'correlationId',
                    kind: 'string',
                    nullable: false,
                };
            case FindTransactionsQuery.Order.Column.TransactionCompletedAt:
                return {
                    property: 'transaction.transactionCompletedAt',
                    entityField: 'transactionCompletedAt',
                    kind: 'datetime',
                    nullable: true,
                };
            case FindTransactionsQuery.Order.Column.TransactionStartAt:
            default:
                return {
                    property: 'transaction.transactionStartedAt',
                    entityField: 'transactionStartedAt',
                    kind: 'datetime',
                    nullable: false,
                };
        }
    }

    private static clampSize(size: number): number {
        if (!Number.isFinite(size) || size <= 0) {
            return TransactionRepository.DEFAULT_SIZE;
        }

        return Math.min(Math.trunc(size), TransactionRepository.MAX_SIZE);
    }

    private static encodeCursor(record: Transaction, meta: TransactionRepository.SortMeta): string {
        const raw = (record as unknown as Record<string, unknown>)[meta.entityField];

        let value: string | null;

        if (raw == null) {
            value = null;
        } else if (meta.kind === 'datetime') {
            value = (raw instanceof Date ? raw : new Date(raw as string)).toISOString();
        } else {
            value = String(raw);
        }

        const payload = JSON.stringify({v: value, id: String(record.id)});

        return Buffer.from(payload, 'utf8').toString('base64');
    }

    private static decodeCursor(token: string): TransactionRepository.DecodedCursor {
        try {
            const json = Buffer.from(token, 'base64').toString('utf8');
            const parsed = JSON.parse(json) as {v?: unknown; id?: unknown};

            if (parsed == null || parsed.id == null) {
                throw new Error('missing id');
            }

            return {v: parsed.v == null ? null : String(parsed.v), id: String(parsed.id)};
        } catch {
            throw new BadRequestException({
                code: 'AUDIT_INVALID_CURSOR',
                message: 'The pagination cursor is invalid.',
            });
        }
    }

    /**
     * Builds the "strictly beyond the cursor" predicate for one keyset page, honouring
     * MySQL null ordering (ASC → nulls first, DESC → nulls last) for the nullable
     * `transaction_completed_at` sort.
     */
    private static keysetWhere(
        meta: TransactionRepository.SortMeta,
        effectiveDir: 'ASC' | 'DESC',
        cursor: TransactionRepository.DecodedCursor,
    ): {sql: string; params: Record<string, unknown>} {
        const col = meta.property;
        const idCol = 'transaction.id';
        const params: Record<string, unknown> = {keysetCid: cursor.id};
        const cursorIsNull = cursor.v == null;

        if (!cursorIsNull) {
            params.keysetCv = meta.kind === 'datetime' ? new Date(cursor.v as string) : cursor.v;
        }

        if (effectiveDir === 'DESC') {
            if (cursorIsNull) {
                return {sql: `(${col} IS NULL AND ${idCol} < :keysetCid)`, params};
            }

            let core = `(${col} < :keysetCv OR (${col} = :keysetCv AND ${idCol} < :keysetCid))`;

            if (meta.nullable) {
                core = `(${core} OR ${col} IS NULL)`;
            }

            return {sql: core, params};
        }

        if (cursorIsNull) {
            return {sql: `((${col} IS NOT NULL) OR (${col} IS NULL AND ${idCol} > :keysetCid))`, params};
        }

        return {
            sql: `(${col} > :keysetCv OR (${col} = :keysetCv AND ${idCol} > :keysetCid))`,
            params,
        };
    }

    /**
     * Merges the two DFSP legs (payer ∪ payee) into a single ordered page — the in-memory
     * equivalent of a SQL `UNION`.
     *
     * Each leg arrives already sorted by `(sortColumn, id)` in `effectiveDir` and capped at
     * `limit` rows. This:
     *   1. de-duplicates by `id` (a transaction where payer == payee == the caller's FSP
     *      appears in both legs — keep it once), then
     *   2. re-sorts the combined set with the SAME ordering the DB used (so the merged page
     *      matches what a single `UNION ... ORDER BY` would have produced), and
     *   3. slices back to `limit` rows (= size + 1, preserving the `hasNext`/`hasPrev` probe).
     */
    private static mergeLegs(
        payerLeg: Transaction[],
        payeeLeg: Transaction[],
        meta: TransactionRepository.SortMeta,
        effectiveDir: 'ASC' | 'DESC',
        limit: number,
    ): Transaction[] {
        const byId = new Map<string, Transaction>();

        for (const record of payerLeg) {
            byId.set(String(record.id), record);
        }

        for (const record of payeeLeg) {
            const id = String(record.id);

            if (!byId.has(id)) {
                byId.set(id, record);
            }
        }

        return Array.from(byId.values())
                    .sort((left, right) => TransactionRepository.compareForMerge(left, right, meta, effectiveDir))
                    .slice(0, limit);
    }

    private static compareForMerge(
        left: Transaction,
        right: Transaction,
        meta: TransactionRepository.SortMeta,
        direction: 'ASC' | 'DESC',
    ): number {
        const leftValue = (left as unknown as Record<string, unknown>)[meta.entityField];
        const rightValue = (right as unknown as Record<string, unknown>)[meta.entityField];

        const valueComparison = TransactionRepository.compareValues(leftValue, rightValue, meta.kind, direction);

        if (valueComparison !== 0) {
            return valueComparison;
        }

        return TransactionRepository.compareId(String(left.id), String(right.id), direction);
    }

    private static compareValues(
        left: unknown,
        right: unknown,
        kind: 'datetime' | 'string',
        direction: 'ASC' | 'DESC',
    ): number {
        if (left == null && right == null) {
            return 0;
        }

        // MySQL: NULLs sort first ASC / last DESC.
        if (left == null) {
            return direction === 'DESC' ? 1 : -1;
        }

        if (right == null) {
            return direction === 'DESC' ? -1 : 1;
        }

        let comparison: number;

        if (kind === 'datetime') {
            const leftTime = left instanceof Date ? left.getTime() : new Date(left as string).getTime();
            const rightTime = right instanceof Date ? right.getTime() : new Date(right as string).getTime();
            comparison = leftTime < rightTime ? -1 : leftTime > rightTime ? 1 : 0;
        } else {
            const leftString = String(left);
            const rightString = String(right);
            comparison = leftString < rightString ? -1 : leftString > rightString ? 1 : 0;
        }

        return direction === 'DESC' ? -comparison : comparison;
    }

    private static compareId(left: string, right: string, direction: 'ASC' | 'DESC'): number {
        const leftId = BigInt(left);
        const rightId = BigInt(right);
        const comparison = leftId < rightId ? -1 : leftId > rightId ? 1 : 0;

        return direction === 'DESC' ? -comparison : comparison;
    }

    private static buildPageInfo(
        position: FindTransactionsQuery.Cursor.Position,
        hasMore: boolean,
        page: Transaction[],
        meta: TransactionRepository.SortMeta,
    ): FindTransactionsQuery.PageInfo {
        let hasNext: boolean;
        let hasPrev: boolean;

        switch (position) {
            case FindTransactionsQuery.Cursor.Position.Next:
                hasNext = hasMore;
                hasPrev = true;
                break;
            case FindTransactionsQuery.Cursor.Position.Prev:
                hasNext = true;
                hasPrev = hasMore;
                break;
            case FindTransactionsQuery.Cursor.Position.Last:
                hasNext = false;
                hasPrev = hasMore;
                break;
            case FindTransactionsQuery.Cursor.Position.First:
            default:
                hasNext = hasMore;
                hasPrev = false;
                break;
        }

        const startCursor = page.length > 0 ? TransactionRepository.encodeCursor(page[0], meta) : undefined;
        const endCursor =
            page.length > 0 ? TransactionRepository.encodeCursor(page[page.length - 1], meta) : undefined;

        return new FindTransactionsQuery.PageInfo(hasNext, hasPrev, startCursor, endCursor);
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
            payeeReceiveAmount: record.payeeReceiveAmount,
            payeeFee: record.payeeFee,
            payerFee: record.payerFee,
            schemeFee: record.schemeFee,
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
            payeeReceiveAmount: record.payeeReceiveAmount,
            payeeFee: record.payeeFee,
            payerFee: record.payerFee,
            schemeFee: record.schemeFee,
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
            payerHomeTransactionId: record.payerHomeTransactionId,
            payeeHomeTransactionId: record.payeeHomeTransactionId,
            createdAt: record.createdAt,
            updatedAt: record.updatedAt,
        };
    }

    private static toReportRecord(record: Transaction): Record<string, unknown> {
        return {
            transferId:      record.correlationId,
            initiatedTimestamp: record.transactionStartedAt,
            payerFsp:        record.payerFsp,
            payeeFsp:        record.payeeFsp,
            payerIdType:     record.payerIdType,
            payerId:         record.payerId,
            payerSubId:      record.payerSubId,
            payerHomeTransactionId: record.payerHomeTransactionId,
            payeeIdType:     record.payeeIdType,
            payeeId:         record.payeeId,
            payeeSubId:      record.payeeSubId,
            payeeHomeTransactionId: record.payeeHomeTransactionId,
            quotingCurrency: record.quotingCurrency,
            quotingAmount:   record.quotingAmount,
            payeeFee:        record.payeeFee,
            payerFee:        record.payerFee,
            schemeFee:       record.schemeFee,
            payeeReceiveAmount: record.payeeReceiveAmount,
            transferAmount:  record.transferAmount,
            transferState:   record.transferState,
            dispute:         record.possibleDispute,
            partiesError:    TransactionRepository.toRawJson(record.partiesError),
            quotesError:     TransactionRepository.toRawJson(record.quotesError),
            transfersError:  TransactionRepository.toRawJson(record.transfersError),
            patchError:      TransactionRepository.toRawJson(record.patchError),
        };
    }

    private static toRawJson(value: unknown): string | null {
        if (value == null) {
            return null;
        }

        if (typeof value === 'string') {
            return value;
        }

        return JSON.stringify(value, TransactionRepository.JSON_REPLACER);
    }
}

export namespace TransactionRepository {

    export type ReportPage = {
        records: Record<string, unknown>[];
        nextCursor?: string;
    };

    export type SortMeta = {
        property: string;
        entityField: string;
        kind: 'datetime' | 'string';
        nullable: boolean;
    };

    export type DecodedCursor = {
        v: string | null;
        id: string;
    };

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
        payeeReceiveAmount?: number | null;
        payeeFee?: number | null;
        payerFee?: number | null;
        schemeFee?: number | null;
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
        payerHomeTransactionId?: string | null;
        payeeHomeTransactionId?: string | null;
        createdAt?: Date | null;
    };
}
