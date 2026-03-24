import {ErrorInformationObject, Money, QuotesIDPutResponse, QuotesPostRequest, TransactionScenario} from '@shared/fspiop';
import {Column, Entity, Index, PrimaryColumn} from 'typeorm';

@Entity({name: 'outbound_quotes'})
@Index('outbound_quotes_01_idx', ['quoteId'])
@Index('outbound_quotes_02_idx', ['createdAt'])
@Index('outbound_quotes_03_idx', ['completedAt'])
@Index('outbound_quotes_04_idx', ['payerFsp', 'payeeFsp'])
@Index('outbound_quotes_05_idx', ['rail'])
@Index('outbound_quotes_06_idx', ['failed'])
@Index('outbound_quotes_07_idx', ['correlationId'])
export class OutboundQuotes {

    @PrimaryColumn({type: 'bigint', name: 'id'})
    public id: string;

    @Column({type: 'varchar', length: 128, name: 'correlation_id'})
    public correlationId: string;

    @Column({type: 'varchar', length: 32, name: 'rail'})
    public rail: string;

    @Column({type: 'varchar', length: 32, name: 'payer_fsp'})
    public payerFsp: string;

    @Column({type: 'varchar', length: 32, name: 'payee_fsp'})
    public payeeFsp: string;

    @Column({type: 'varchar', length: 64, name: 'quote_id'})
    public quoteId: string;

    @Column({type: 'varchar', length: 32, name: 'scenario'})
    public scenario: TransactionScenario;

    @Column({type: 'varchar', length: 128, name: 'sub_scenario', nullable: true})
    public subScenario: string | null;

    @Column({type: 'jsonb', name: 'amount'})
    public amount: Money;

    @Column({type: 'jsonb', name: 'request'})
    public request: QuotesPostRequest;

    @Column({type: 'jsonb', name: 'response', nullable: true})
    public response: QuotesIDPutResponse | null;

    @Column({type: 'jsonb', name: 'error', nullable: true})
    public error: ErrorInformationObject | null;

    @Column({type: 'boolean', name: 'failed', default: false})
    public failed: boolean;

    @Column({type: 'timestamptz', name: 'created_at'})
    public createdAt: Date;

    @Column({type: 'timestamptz', name: 'completed_at', nullable: true})
    public completedAt: Date | null;

    constructor(
        id: string,
        correlationId: string,
        rail: string,
        payerFsp: string,
        payeeFsp: string,
        quoteId: string,
        request: QuotesPostRequest,
        response: QuotesIDPutResponse | null = null,
        error: ErrorInformationObject | null = null,
        failed: boolean = false,
        createdAt: Date = new Date(),
        completedAt: Date | null = null,
    ) {

        this.id = id;
        this.correlationId = correlationId;
        this.rail = rail;
        this.payerFsp = payerFsp;
        this.payeeFsp = payeeFsp;
        this.quoteId = quoteId;
        this.scenario = request?.transactionType?.scenario as TransactionScenario;
        this.subScenario = request?.transactionType?.subScenario ?? null;
        this.amount = request?.amount as Money;
        this.request = request;
        this.response = response;
        this.error = error;
        this.failed = failed;
        this.createdAt = createdAt;
        this.completedAt = completedAt;
    }
}
