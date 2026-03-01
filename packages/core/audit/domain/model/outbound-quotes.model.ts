import {ErrorInformationObject, QuotesIDPutResponse, QuotesPostRequest} from '@shared/fspiop';
import {Column, Entity, Index, PrimaryGeneratedColumn} from 'typeorm';

@Entity({name: 'outbound_quotes'})
@Index('outbound_quotes_01_idx', ['correlationId'])
@Index('outbound_quotes_02_idx', ['quoteId'])
@Index('outbound_quotes_03_idx', ['createdAt'])
@Index('outbound_quotes_04_idx', ['completedAt'])
@Index('outbound_quotes_05_idx', ['payerFsp', 'payeeFsp'])
@Index('outbound_quotes_06_idx', ['rail'])
@Index('outbound_quotes_07_idx', ['failed'])
export class OutboundQuotes {

    @PrimaryGeneratedColumn('increment', {type: 'bigint', name: 'id'})
    public id: string;

    @Column({type: 'varchar', length: 32, name: 'rail'})
    public rail: string;

    @Column({type: 'varchar', length: 32, name: 'payer_fsp'})
    public payerFsp: string;

    @Column({type: 'varchar', length: 32, name: 'payee_fsp'})
    public payeeFsp: string;

    @Column({type: 'bigint', name: 'correlation_id'})
    public correlationId: bigint;

    @Column({type: 'varchar', length: 64, name: 'quote_id'})
    public quoteId: string;

    @Column({type: 'jsonb', name: 'request'})
    public request: QuotesPostRequest;

    @Column({type: 'jsonb', name: 'response', nullable: true})
    public response: QuotesIDPutResponse | null;

    @Column({type: 'jsonb', name: 'error', nullable: true})
    public error: ErrorInformationObject | null;

    @Column({type: 'boolean', name: 'failed', default: false})
    public failed: boolean = false;

    @Column({type: 'timestamptz', name: 'created_at'})
    public createdAt: Date;

    @Column({type: 'timestamptz', name: 'completed_at'})
    public completedAt: Date;

    constructor(
        rail: string,
        payerFsp: string,
        payeeFsp: string,
        correlationId: bigint,
        quoteId: string,
        request: QuotesPostRequest,
    ) {

        this.rail = rail;
        this.payerFsp = payerFsp;
        this.payeeFsp = payeeFsp;
        this.correlationId = correlationId;
        this.quoteId = quoteId;
        this.request = request;
        this.createdAt = new Date();
    }

    public complete(response: QuotesIDPutResponse | null): void {

        this.response = response ?? null;
        this.completedAt = new Date();
        this.error = null;
    }

    public fail(error: ErrorInformationObject): void {

        this.error = error;
        this.completedAt = new Date();
        this.response = null;
        this.failed = true;
    }
}
