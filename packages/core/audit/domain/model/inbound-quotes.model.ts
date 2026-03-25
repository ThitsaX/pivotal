import {ErrorInformationObject, Money, QuotesIDPutResponse, QuotesPostRequest, TransactionScenario} from '@shared/fspiop';
import {Column, Entity, Index, PrimaryColumn} from 'typeorm';
import {InboundStageEnum} from './inbound-stage.enum';

@Entity({name: 'inbound_quotes'})
@Index('inbound_quotes_01_idx', ['quoteId'])
@Index('inbound_quotes_02_idx', ['createdAt'])
@Index('inbound_quotes_03_idx', ['completedAt'])
@Index('inbound_quotes_04_idx', ['payerFsp', 'payeeFsp'])
@Index('inbound_quotes_05_idx', ['rail'])
@Index('inbound_quotes_06_idx', ['failed'])
@Index('inbound_quotes_07_idx', ['correlationId'])
export class InboundQuotes {

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

    @Column({type: 'varchar', length: 32, name: 'scenario', nullable: true})
    public scenario: TransactionScenario | null;

    @Column({type: 'varchar', length: 128, name: 'sub_scenario', nullable: true})
    public subScenario: string | null;

    @Column({type: 'jsonb', name: 'amount', nullable: true})
    public amount: Money | null;

    @Column({type: 'jsonb', name: 'request', nullable: true})
    public request: QuotesPostRequest | null;

    @Column({type: 'jsonb', name: 'response', nullable: true})
    public response: QuotesIDPutResponse | null;

    @Column({type: 'jsonb', name: 'error', nullable: true})
    public error: ErrorInformationObject | null;

    @Column({type: 'text', name: 'fsp_error', nullable: true})
    public fspError: string | null;

    @Column({type: 'boolean', name: 'failed', default: false})
    public failed: boolean;

    @Column({type: 'timestamptz', name: 'created_at'})
    public createdAt: Date;

    @Column({type: 'timestamptz', name: 'completed_at', nullable: true})
    public completedAt: Date | null;

    @Column({type: 'varchar', length: 32, name: 'stage', default: InboundStageEnum.AT_CONNECTOR})
    public stage: InboundStageEnum;

    constructor(
        id: string,
        correlationId: string,
        rail: string,
        payerFsp: string,
        payeeFsp: string,
        quoteId: string,
        request: QuotesPostRequest | null = null,
        response: QuotesIDPutResponse | null = null,
        error: ErrorInformationObject | null = null,
        fspError: string | null = null,
        failed: boolean = false,
        createdAt: Date = new Date(),
        completedAt: Date | null = null,
        stage: InboundStageEnum = InboundStageEnum.AT_CONNECTOR,
    ) {

        this.id = id;
        this.correlationId = correlationId;
        this.rail = rail;
        this.payerFsp = payerFsp;
        this.payeeFsp = payeeFsp;
        this.quoteId = quoteId;
        this.scenario = request?.transactionType?.scenario as TransactionScenario ?? null;
        this.subScenario = request?.transactionType?.subScenario ?? null;
        this.amount = request?.amount as Money ?? null;
        this.request = request;
        this.response = response;
        this.error = error;
        this.fspError = fspError;
        this.failed = failed;
        this.createdAt = createdAt;
        this.completedAt = completedAt;
        this.stage = stage;
    }
}
