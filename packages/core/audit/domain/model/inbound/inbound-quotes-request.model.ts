import {QuotesPostRequest} from '@shared/fspiop';
import {Column, Entity, Index, PrimaryColumn} from 'typeorm';

@Entity({name: 'inbound_quotes_request'})
@Index('inbound_quotes_request_01_idx', ['correlationId'])
@Index('inbound_quotes_request_02_idx', ['quoteId'])
@Index('inbound_quotes_request_03_idx', ['createdAt'])
@Index('inbound_quotes_request_04_idx', ['payerFsp', 'payeeFsp'])
@Index('inbound_quotes_request_05_idx', ['rail'])
export class InboundQuotesRequest {

    @PrimaryColumn({type: 'bigint', name: 'id'})
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

    @Column({type: 'timestamptz', name: 'created_at'})
    public createdAt: Date;

    constructor(
        id: string,
        rail: string,
        payerFsp: string,
        payeeFsp: string,
        correlationId: bigint,
        quoteId: string,
        request: QuotesPostRequest,
    ) {

        this.id = id;
        this.rail = rail;
        this.payerFsp = payerFsp;
        this.payeeFsp = payeeFsp;
        this.correlationId = correlationId;
        this.quoteId = quoteId;
        this.request = request;
        this.createdAt = new Date();
    }
}
