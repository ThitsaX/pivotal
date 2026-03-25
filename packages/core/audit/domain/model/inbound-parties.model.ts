import {ErrorInformationObject, PartiesTypeIDPutResponse, PartyIdType} from '@shared/fspiop';
import {Column, Entity, Index, PrimaryColumn} from 'typeorm';
import {InboundStageEnum} from './inbound-stage.enum';

@Entity({name: 'inbound_parties'})
@Index('inbound_parties_01_idx', ['partyIdType', 'partyId'])
@Index('inbound_parties_02_idx', ['partyIdType', 'partyId', 'subId'])
@Index('inbound_parties_03_idx', ['createdAt'])
@Index('inbound_parties_04_idx', ['completedAt'])
@Index('inbound_parties_05_idx', ['payerFsp', 'payeeFsp'])
@Index('inbound_parties_06_idx', ['rail'])
@Index('inbound_parties_07_idx', ['failed'])
@Index('inbound_parties_08_idx', ['correlationId'])
export class InboundParties {

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
        partyIdType: PartyIdType,
        partyId: string,
        subId: string | undefined | null = null,
        response: PartiesTypeIDPutResponse | null = null,
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
        this.partyIdType = partyIdType;
        this.partyId = partyId;
        this.subId = subId ?? null;
        this.response = response;
        this.error = error;
        this.fspError = fspError;
        this.failed = failed;
        this.createdAt = createdAt;
        this.completedAt = completedAt;
        this.stage = stage;
    }
}
