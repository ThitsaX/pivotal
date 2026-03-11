import {ErrorInformationObject, TransfersIDPutResponse, TransfersPostRequest} from '@shared/fspiop';
import {Column, Entity, Index, PrimaryColumn} from 'typeorm';

@Entity({name: 'outbound_transfers'})
@Index('outbound_transfers_02_idx', ['transferId'])
@Index('outbound_transfers_03_idx', ['createdAt'])
@Index('outbound_transfers_04_idx', ['completedAt'])
@Index('outbound_transfers_05_idx', ['payerFsp', 'payeeFsp'])
@Index('outbound_transfers_06_idx', ['rail'])
@Index('outbound_transfers_07_idx', ['failed'])
export class OutboundTransfers {

    @PrimaryColumn({type: 'bigint', name: 'id'})
    public id: string;

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
        transferId: string,
        request: TransfersPostRequest,
        response: TransfersIDPutResponse | null = null,
        error: ErrorInformationObject | null = null,
        failed: boolean = false,
        createdAt: Date = new Date(),
        completedAt: Date | null = null,
    ) {

        this.id = id;
        this.rail = rail;
        this.payerFsp = payerFsp;
        this.payeeFsp = payeeFsp;
        this.transferId = transferId;
        this.request = request;
        this.response = response;
        this.error = error;
        this.failed = failed;
        this.createdAt = createdAt;
        this.completedAt = completedAt;
    }
}
