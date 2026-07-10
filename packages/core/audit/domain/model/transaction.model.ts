// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {
    Currency,
    PartyIdType,
    TransactionInitiatorType,
    TransactionScenario,
    TransferState,
} from '@shared/fspiop';
import {Snowflake} from '@shared/snowflake';
import {BeforeInsert, Column, Entity, Index, PrimaryColumn} from 'typeorm';

const DECIMAL_TRANSFORMER = {
    to(value: number | null): number | null {
        return value;
    },
    from(value: string | null): number | null {
        return value == null ? null : Number(value);
    },
};

@Entity({name: 'transactions'})
@Index('transactions_01_idx', ['payerFsp', 'payeeFsp', 'transferState', 'transactionStartedAt'])
@Index('transactions_02_idx', ['payerFsp', 'payeeFsp', 'transferState', 'transactionCompletedAt'])
@Index('transactions_03_idx', ['payerFsp', 'payeeFsp', 'transactionType', 'subScenario', 'quotingCurrency', 'transactionStartedAt'])
@Index('transactions_04_idx', ['payerFsp', 'payeeFsp', 'transactionType', 'subScenario', 'transferCurrency', 'transactionStartedAt'])
@Index('transactions_05_idx', ['payerFsp', 'payeeFsp', 'error', 'transactionStartedAt'])
@Index('transactions_06_idx', ['createdAt'])
@Index('transactions_07_idx', ['updatedAt'])
@Index('transactions_08_uk', ['correlationId'], {unique: true})
@Index('transactions_09_idx', ['payerFsp', 'payeeFsp', 'outboundPartiesRequestedAt'])
@Index('transactions_10_idx', ['payerFsp', 'payeeFsp', 'inboundPartiesRequestedAt'])
@Index('transactions_11_idx', ['payerFsp', 'payeeFsp', 'outboundQuotesRequestedAt'])
@Index('transactions_12_idx', ['payerFsp', 'payeeFsp', 'inboundQuotesRequestedAt'])
@Index('transactions_13_idx', ['payerFsp', 'payeeFsp', 'outboundTransfersRequestedAt'])
@Index('transactions_14_idx', ['payerFsp', 'payeeFsp', 'inboundTransfersRequestedAt'])
@Index('transactions_15_idx', ['payerIdType', 'payerId', 'payerSubId', 'transactionStartedAt'])
@Index('transactions_16_idx', ['payeeIdType', 'payeeId', 'payeeSubId', 'transactionStartedAt'])
@Index('transactions_17_idx', ['possibleDispute', 'transactionStartedAt'])
@Index('transactions_18_idx', ['transactionStartedAt', 'id'])
@Index('transactions_19_idx', ['payerFsp', 'transactionStartedAt', 'id'])
@Index('transactions_20_idx', ['payeeFsp', 'transactionStartedAt', 'id'])
@Index('transactions_21_idx', ['transactionCompletedAt', 'id'])
export class Transaction {

    private static readonly SNOWFLAKE = Snowflake.get();

    @PrimaryColumn({type: 'bigint', name: 'id'})
    public id!: string;

    @Column({type: 'varchar', length: 128, name: 'correlation_id'})
    public correlationId!: string;

    @Column({type: 'varchar', length: 32, name: 'payer_fsp'})
    public payerFsp!: string;

    @Column({type: 'varchar', length: 32, name: 'payee_fsp'})
    public payeeFsp!: string;

    @Column({type: 'varchar', length: 32, name: 'payer_id_type', nullable: true})
    public payerIdType!: PartyIdType | null;

    @Column({type: 'varchar', length: 128, name: 'payer_id', nullable: true})
    public payerId!: string | null;

    @Column({type: 'varchar', length: 128, name: 'payer_sub_id', nullable: true})
    public payerSubId!: string | null;

    @Column({type: 'varchar', length: 32, name: 'payee_id_type', nullable: true})
    public payeeIdType!: PartyIdType | null;

    @Column({type: 'varchar', length: 128, name: 'payee_id', nullable: true})
    public payeeId!: string | null;

    @Column({type: 'varchar', length: 128, name: 'payee_sub_id', nullable: true})
    public payeeSubId!: string | null;

    @Column({type: 'varchar', length: 32, name: 'transaction_initiator_type', nullable: true})
    public transactionInitiatorType!: TransactionInitiatorType | null;

    @Column({type: 'varchar', length: 3, name: 'quoting_currency', nullable: true})
    public quotingCurrency!: Currency | null;

    @Column({
        type: 'decimal',
        precision: 34,
        scale: 4,
        name: 'quoting_amount',
        nullable: true,
        transformer: DECIMAL_TRANSFORMER,
    })
    public quotingAmount!: number | null;

    @Column({type: 'varchar', length: 3, name: 'transfer_currency', nullable: true})
    public transferCurrency!: Currency | null;

    @Column({
        type: 'decimal',
        precision: 34,
        scale: 4,
        name: 'transfer_amount',
        nullable: true,
        transformer: DECIMAL_TRANSFORMER,
    })
    public transferAmount!: number | null;

    @Column({
        type: 'decimal',
        precision: 34,
        scale: 4,
        name: 'payee_receive_amount',
        nullable: true,
        transformer: DECIMAL_TRANSFORMER,
    })
    public payeeReceiveAmount!: number | null;

    @Column({
        type: 'decimal',
        precision: 34,
        scale: 4,
        name: 'payee_fee',
        nullable: true,
        transformer: DECIMAL_TRANSFORMER,
    })
    public payeeFee!: number | null;

    @Column({
        type: 'decimal',
        precision: 34,
        scale: 4,
        name: 'payer_fee',
        nullable: true,
        transformer: DECIMAL_TRANSFORMER,
    })
    public payerFee!: number | null;

    @Column({
        type: 'decimal',
        precision: 34,
        scale: 4,
        name: 'scheme_fee',
        nullable: true,
        transformer: DECIMAL_TRANSFORMER,
    })
    public schemeFee!: number | null;

    @Column({type: 'varchar', length: 32, name: 'transaction_type', nullable: true})
    public transactionType!: TransactionScenario | null;

    @Column({type: 'varchar', length: 128, name: 'sub_scenario', nullable: true})
    public subScenario!: string | null;

    @Column({type: 'varchar', length: 32, name: 'transfer_state', nullable: true})
    public transferState!: TransferState | null;

    @Column({type: 'datetime', name: 'transaction_started_at'})
    public transactionStartedAt!: Date;

    @Column({type: 'datetime', name: 'transaction_completed_at', nullable: true})
    public transactionCompletedAt!: Date | null;

    @Column({type: 'boolean', name: 'possible_dispute', default: false})
    public possibleDispute!: boolean;

    @Column({type: 'boolean', name: 'error', default: false})
    public error!: boolean;

    @Column({type: 'integer', name: 'flow', nullable: true})
    public flow!: number | null;

    @Column({type: 'datetime', name: 'parties_requested_at', nullable: true})
    public partiesRequestedAt!: Date | null;

    @Column({type: 'datetime', name: 'parties_responded_at', nullable: true})
    public partiesRespondedAt!: Date | null;

    @Column({type: 'json', name: 'parties_request', nullable: true})
    public partiesRequest!: unknown | null;

    @Column({type: 'json', name: 'parties_response', nullable: true})
    public partiesResponse!: unknown | null;

    @Column({type: 'json', name: 'parties_error', nullable: true})
    public partiesError!: unknown | null;

    @Column({type: 'datetime', name: 'outbound_parties_requested_at', nullable: true})
    public outboundPartiesRequestedAt!: Date | null;

    @Column({type: 'datetime', name: 'outbound_parties_responded_at', nullable: true})
    public outboundPartiesRespondedAt!: Date | null;

    @Column({type: 'datetime', name: 'inbound_parties_requested_at', nullable: true})
    public inboundPartiesRequestedAt!: Date | null;

    @Column({type: 'datetime', name: 'inbound_parties_responded_at', nullable: true})
    public inboundPartiesRespondedAt!: Date | null;

    @Column({type: 'datetime', name: 'connector_parties_requested_at', nullable: true})
    public connectorPartiesRequestedAt!: Date | null;

    @Column({type: 'datetime', name: 'connector_parties_responded_at', nullable: true})
    public connectorPartiesRespondedAt!: Date | null;

    @Column({type: 'datetime', name: 'quotes_requested_at', nullable: true})
    public quotesRequestedAt!: Date | null;

    @Column({type: 'datetime', name: 'quotes_responded_at', nullable: true})
    public quotesRespondedAt!: Date | null;

    @Column({type: 'json', name: 'quotes_request', nullable: true})
    public quotesRequest!: unknown | null;

    @Column({type: 'json', name: 'quotes_response', nullable: true})
    public quotesResponse!: unknown | null;

    @Column({type: 'json', name: 'quotes_error', nullable: true})
    public quotesError!: unknown | null;

    @Column({type: 'datetime', name: 'outbound_quotes_requested_at', nullable: true})
    public outboundQuotesRequestedAt!: Date | null;

    @Column({type: 'datetime', name: 'outbound_quotes_responded_at', nullable: true})
    public outboundQuotesRespondedAt!: Date | null;

    @Column({type: 'datetime', name: 'inbound_quotes_requested_at', nullable: true})
    public inboundQuotesRequestedAt!: Date | null;

    @Column({type: 'datetime', name: 'inbound_quotes_responded_at', nullable: true})
    public inboundQuotesRespondedAt!: Date | null;

    @Column({type: 'datetime', name: 'connector_quotes_requested_at', nullable: true})
    public connectorQuotesRequestedAt!: Date | null;

    @Column({type: 'datetime', name: 'connector_quotes_responded_at', nullable: true})
    public connectorQuotesRespondedAt!: Date | null;

    @Column({type: 'datetime', name: 'transfers_requested_at', nullable: true})
    public transfersRequestedAt!: Date | null;

    @Column({type: 'datetime', name: 'transfers_responded_at', nullable: true})
    public transfersRespondedAt!: Date | null;

    @Column({type: 'json', name: 'transfers_request', nullable: true})
    public transfersRequest!: unknown | null;

    @Column({type: 'json', name: 'transfers_response', nullable: true})
    public transfersResponse!: unknown | null;

    @Column({type: 'json', name: 'transfers_error', nullable: true})
    public transfersError!: unknown | null;

    @Column({type: 'datetime', name: 'outbound_transfers_requested_at', nullable: true})
    public outboundTransfersRequestedAt!: Date | null;

    @Column({type: 'datetime', name: 'outbound_transfers_responded_at', nullable: true})
    public outboundTransfersRespondedAt!: Date | null;

    @Column({type: 'datetime', name: 'inbound_transfers_requested_at', nullable: true})
    public inboundTransfersRequestedAt!: Date | null;

    @Column({type: 'datetime', name: 'inbound_transfers_responded_at', nullable: true})
    public inboundTransfersRespondedAt!: Date | null;

    @Column({type: 'datetime', name: 'connector_transfers_requested_at', nullable: true})
    public connectorTransfersRequestedAt!: Date | null;

    @Column({type: 'datetime', name: 'connector_transfers_responded_at', nullable: true})
    public connectorTransfersRespondedAt!: Date | null;

    @Column({type: 'datetime', name: 'patch_requested_at', nullable: true})
    public patchRequestedAt!: Date | null;

    @Column({type: 'datetime', name: 'patch_responded_at', nullable: true})
    public patchRespondedAt!: Date | null;

    @Column({type: 'json', name: 'patch_request', nullable: true})
    public patchRequest!: unknown | null;

    @Column({type: 'text', name: 'patch_error', nullable: true})
    public patchError!: string | null;

    @Column({type: 'varchar', length: 128, name: 'payer_home_transaction_id', nullable: true})
    public payerHomeTransactionId!: string | null;

    @Column({type: 'varchar', length: 128, name: 'payee_home_transaction_id', nullable: true})
    public payeeHomeTransactionId!: string | null;

    @Column({type: 'datetime', name: 'created_at'})
    public createdAt!: Date;

    @Column({type: 'datetime', name: 'updated_at'})
    public updatedAt!: Date;

    @BeforeInsert()
    private assignId(): void {
        if (this.id == null) {
            this.id = Transaction.SNOWFLAKE.nextId().toString();
        }
    }
}
