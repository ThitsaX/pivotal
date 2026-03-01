import {PartyIdType} from '@shared/fspiop';
import {Column, Entity, Index, PrimaryColumn} from 'typeorm';

@Entity({name: 'inbound_parties_request'})
@Index('inbound_parties_request_01_idx', ['correlationId'])
@Index('inbound_parties_request_02_idx', ['partyIdType', 'partyId'])
@Index('inbound_parties_request_03_idx', ['partyIdType', 'partyId', 'subId'])
@Index('inbound_parties_request_04_idx', ['createdAt'])
@Index('inbound_parties_request_05_idx', ['payerFsp', 'payeeFsp'])
@Index('inbound_parties_request_06_idx', ['rail'])
export class InboundPartiesRequest {

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

    @Column({type: 'varchar', length: 32, name: 'party_id_type'})
    public partyIdType: PartyIdType;

    @Column({type: 'varchar', length: 128, name: 'party_id'})
    public partyId: string;

    @Column({type: 'varchar', length: 128, name: 'sub_id'})
    public subId: string | undefined | null;

    @Column({type: 'timestamptz', name: 'created_at'})
    public createdAt: Date;

    constructor(
        id: string,
        rail: string,
        payerFsp: string,
        payeeFsp: string,
        correlationId: bigint,
        partyIdType: PartyIdType,
        partyId: string,
        subId?: string,
    ) {

        this.id = id;
        this.rail = rail;
        this.payerFsp = payerFsp;
        this.payeeFsp = payeeFsp;
        this.correlationId = correlationId;
        this.partyIdType = partyIdType;
        this.partyId = partyId;
        this.subId = subId ?? null;
        this.createdAt = new Date();
    }
}
