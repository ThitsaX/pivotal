import {ErrorInformationObject, QuotesIDPutResponse, QuotesPostRequest} from '@shared/fspiop';
import {Column, Entity, Index, PrimaryColumn} from 'typeorm';

@Entity({name: 'inbound_quotes'})
@Index('inbound_quotes_01_idx', ['correlationId'])
@Index('inbound_quotes_02_idx', ['quoteId'])
@Index('inbound_quotes_03_idx', ['createdAt'])
@Index('inbound_quotes_04_idx', ['completedAt'])
@Index('inbound_quotes_05_idx', ['payerFsp', 'payeeFsp'])
@Index('inbound_quotes_06_idx', ['rail'])
@Index('inbound_quotes_07_idx', ['failed'])
export class InboundQuotes {

    @PrimaryColumn({type: 'bigint', name: 'id'})
    public id: string;

    @Column({type: 'varchar', length: 32, name: 'rail'})
    public rail: string;

    @Column({type: 'varchar', length: 32, name: 'payer_fsp'})
    public payerFsp: string;

    @Column({type: 'varchar', length: 32, name: 'payee_fsp'})
    public payeeFsp: string;

    @Column({type: 'varchar', length: 128, name: 'correlation_id'})
    public correlationId: string;

    @Column({type: 'varchar', length: 64, name: 'quote_id'})
    public quoteId: string;

    @Column({type: 'jsonb', name: 'request'})
    public request: QuotesPostRequest;

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

    constructor(
        id: string,
        rail: string,
        payerFsp: string,
        payeeFsp: string,
        correlationId: string,
        quoteId: string,
        request: QuotesPostRequest,
        response: QuotesIDPutResponse | null = null,
        error: ErrorInformationObject | null = null,
        fspError: string | null = null,
        failed: boolean = false,
        createdAt: Date = new Date(),
        completedAt: Date | null = null,
    ) {

        this.id = id;
        this.rail = rail;
        this.payerFsp = payerFsp;
        this.payeeFsp = payeeFsp;
        this.correlationId = correlationId;
        this.quoteId = quoteId;
        this.request = request;
        this.response = response;
        this.error = error;
        this.fspError = fspError;
        this.failed = failed;
        this.createdAt = createdAt;
        this.completedAt = completedAt;
    }
}
