import {ErrorInformationObject, PartiesTypeIDPutResponse, PartyIdType} from '@shared/fspiop';
import {Column, Entity, Index, PrimaryGeneratedColumn} from 'typeorm';

@Entity({name: 'outbound_parties'})
@Index('outbound_parties_01_idx', ['correlationId'])
@Index('outbound_parties_02_idx', ['partyIdType', 'partyId'])
@Index('outbound_parties_03_idx', ['partyIdType', 'partyId', 'subId'])
@Index('outbound_parties_04_idx', ['createdAt'])
@Index('outbound_parties_05_idx', ['completedAt'])
@Index('outbound_parties_06_idx', ['payerFsp', 'payeeFsp'])
export class OutboundParties {

    @PrimaryGeneratedColumn({type: 'bigint', name: 'id'})
    public id: string;

    @Column({type: 'varchar', length: 32, name: 'payer_fsp'})
    public payerFsp: string;

    @Column({type: 'varchar', length: 32, name: 'payee_fsp'})
    public payeeFsp: string;

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

    @Column({type: 'jsonb', name: 'error', nullable: true})
    public error: ErrorInformationObject | null;

    @Column({type: 'timestamptz', name: 'created_at'})
    public createdAt: Date;

    @Column({type: 'timestamptz', name: 'completed_at'})
    public completedAt: Date;

    constructor(
        payerFsp: string,
        payeeFsp: string,
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

    public complete(response: PartiesTypeIDPutResponse | null): void {

        this.response = response;
        this.completedAt = new Date();
        this.error = null;
    }

    public fail(error: ErrorInformationObject): void {

        this.error = error;
        this.completedAt = new Date();
        this.response = null;
    }
}
