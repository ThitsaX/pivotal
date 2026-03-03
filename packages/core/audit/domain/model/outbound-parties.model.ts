import {ErrorInformationObject, PartiesTypeIDPutResponse, PartyIdType} from '@shared/fspiop';
import {Column, Entity, Index, PrimaryColumn} from 'typeorm';

@Entity({name: 'outbound_parties'})
@Index('outbound_parties_01_idx', ['correlationId'])
@Index('outbound_parties_02_idx', ['partyIdType', 'partyId'])
@Index('outbound_parties_03_idx', ['partyIdType', 'partyId', 'subId'])
@Index('outbound_parties_04_idx', ['createdAt'])
@Index('outbound_parties_05_idx', ['completedAt'])
@Index('outbound_parties_06_idx', ['payerFsp', 'payeeFsp'])
@Index('outbound_parties_07_idx', ['rail'])
@Index('outbound_parties_08_idx', ['failed'])
export class OutboundParties {

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
        partyIdType: PartyIdType,
        partyId: string,
        subId: string | undefined | null = null,
        response: PartiesTypeIDPutResponse | null = null,
        error: ErrorInformationObject | null = null,
        failed: boolean = false,
        createdAt: Date = new Date(),
        completedAt: Date | null = null,
    ) {

        this.id = id;
        this.rail = rail;
        this.payerFsp = payerFsp;
        this.payeeFsp = payeeFsp;
        this.correlationId = correlationId;
        this.partyIdType = partyIdType;
        this.partyId = partyId;
        this.subId = subId ?? null;
        this.response = response;
        this.error = error;
        this.failed = failed;
        this.createdAt = createdAt;
        this.completedAt = completedAt;
    }
}
