import {ErrorInformationObject, PartiesTypeIDPutResponse} from '@shared/fspiop';
import {Column, Entity, Index, PrimaryColumn} from 'typeorm';

@Entity({name: 'outbound_parties_response'})
@Index('outbound_parties_response_01_idx', ['completedAt'])
export class OutboundPartiesResponse {

    @PrimaryColumn({type: 'bigint', name: 'id'})
    public id: string;

    @Column({type: 'jsonb', name: 'response', nullable: true})
    public response: PartiesTypeIDPutResponse | null;

    @Column({type: 'jsonb', name: 'error', nullable: true})
    public error: ErrorInformationObject | null;

    @Column({type: 'timestamptz', name: 'completed_at'})
    public completedAt: Date;

    constructor(id: string) {
        this.id = id;
    }

    public complete(response: PartiesTypeIDPutResponse | null): void {

        this.response = response ?? null;
        this.completedAt = new Date();
        this.error = null;
    }

    public fail(error: ErrorInformationObject): void {

        this.error = error;
        this.completedAt = new Date();
        this.response = null;
    }
}
