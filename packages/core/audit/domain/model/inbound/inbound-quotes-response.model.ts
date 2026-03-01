import {ErrorInformationObject, QuotesIDPutResponse} from '@shared/fspiop';
import {Column, Entity, Index, PrimaryColumn} from 'typeorm';

@Entity({name: 'inbound_quotes_response'})
@Index('inbound_quotes_response_01_idx', ['completedAt'])
export class InboundQuotesResponse {

    @PrimaryColumn({type: 'bigint', name: 'id'})
    public id: string;

    @Column({type: 'jsonb', name: 'response', nullable: true})
    public response: QuotesIDPutResponse | null;

    @Column({type: 'jsonb', name: 'error', nullable: true})
    public error: ErrorInformationObject | null;

    @Column({type: 'text', name: 'fsp_error', nullable: true})
    public fspError: string | null;

    @Column({type: 'timestamptz', name: 'completed_at'})
    public completedAt: Date;

    constructor(id: string) {
        this.id = id;
        this.fspError = null;
    }

    public complete(response: QuotesIDPutResponse | null): void {

        this.response = response ?? null;
        this.completedAt = new Date();
        this.error = null;
        this.fspError = null;
    }

    public fail(error: ErrorInformationObject, fspError?: string): void {

        this.error = error;
        this.fspError = fspError ?? error.errorInformation.errorDescription;
        this.completedAt = new Date();
        this.response = null;
    }
}
