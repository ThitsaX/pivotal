import {PartiesTypeIDPutResponse, PartyIdType} from '@shared/fspiop';
import {Column, Entity, Index, PrimaryGeneratedColumn} from 'typeorm';

@Entity({name: 'outbound_parties'})
@Index('outbound_parties_correlation_id_idx', ['correlationId'])
@Index('outbound_parties_party_lookup_idx', ['partyIdType', 'partyId', 'subId'])
export class OutboundParties {

    @PrimaryGeneratedColumn({type: 'bigint', name: 'id'})
    public id: string;

    @Column({type: 'bigint', name: 'correlation_id'})
    public correlationId: number;

    @Column({type: 'varchar', length: 32, name: 'party_id_type'})
    public partyIdType: PartyIdType;

    @Column({type: 'varchar', length: 128, name: 'party_id'})
    public partyId: string;

    @Column({type: 'varchar', length: 128, name: 'sub_id'})
    public subId: string | undefined | null;

    @Column({type: 'jsonb', name: 'response', nullable: true})
    public response: PartiesTypeIDPutResponse | null;

    @Column({type: 'timestamptz', name: 'created_at'})
    public createdAt: Date;

    constructor(
        correlationId: number,
        partyIdType: PartyIdType,
        partyId: string,
        subId?: string,
        response?: PartiesTypeIDPutResponse | null,
    ) {

        this.correlationId = correlationId;
        this.partyIdType = partyIdType;
        this.partyId = partyId;
        this.subId = subId ?? null;
        this.response = response ?? null;
        this.createdAt = new Date();
    }
}
