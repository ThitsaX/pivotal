import {ErrorInformationObject, TransfersIDPutResponse, TransfersPostRequest} from '@shared/fspiop';
import {Column, Entity, Index, PrimaryColumn} from 'typeorm';

@Entity({name: 'inbound_transfers'})
@Index('inbound_transfers_01_idx', ['transferId'])
@Index('inbound_transfers_02_idx', ['createdAt'])
@Index('inbound_transfers_03_idx', ['completedAt'])
@Index('inbound_transfers_04_idx', ['payerFsp', 'payeeFsp'])
@Index('inbound_transfers_05_idx', ['rail'])
@Index('inbound_transfers_06_idx', ['failed'])
@Index('inbound_transfers_07_idx', ['correlationId'])
export class InboundTransfers {

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

    @Column({type: 'varchar', length: 64, name: 'transfer_id'})
    public transferId: string;

    @Column({type: 'jsonb', name: 'request'})
    public request: TransfersPostRequest;

    @Column({type: 'jsonb', name: 'response', nullable: true})
    public response: TransfersIDPutResponse | null;

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
        correlationId: string,
        rail: string,
        payerFsp: string,
        payeeFsp: string,
        transferId: string,
        request: TransfersPostRequest,
        response: TransfersIDPutResponse | null = null,
        error: ErrorInformationObject | null = null,
        fspError: string | null = null,
        failed: boolean = false,
        createdAt: Date = new Date(),
        completedAt: Date | null = null,
    ) {

        this.id = id;
        this.correlationId = correlationId;
        this.rail = rail;
        this.payerFsp = payerFsp;
        this.payeeFsp = payeeFsp;
        this.transferId = transferId;
        this.request = request;
        this.response = response;
        this.error = error;
        this.fspError = fspError;
        this.failed = failed;
        this.createdAt = createdAt;
        this.completedAt = completedAt;
    }
}
