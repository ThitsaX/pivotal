import {ErrorInformationObject, TransfersIDPutResponse, TransfersPostRequest} from '@shared/fspiop';
import {Column, Entity, Index, PrimaryGeneratedColumn} from 'typeorm';

@Entity({name: 'outbound_transfers'})
@Index('outbound_transfers_01_idx', ['correlationId'])
@Index('outbound_transfers_02_idx', ['transferId'])
@Index('outbound_transfers_03_idx', ['createdAt'])
@Index('outbound_transfers_04_idx', ['completedAt'])
@Index('outbound_transfers_05_idx', ['payerFsp', 'payeeFsp'])
@Index('outbound_transfers_06_idx', ['rail'])
@Index('outbound_transfers_07_idx', ['failed'])
export class OutboundTransfers {

    @PrimaryGeneratedColumn('increment', {type: 'bigint', name: 'id'})
    public id: string;

    @Column({type: 'varchar', length: 32, name: 'rail'})
    public rail: string;

    @Column({type: 'varchar', length: 32, name: 'payer_fsp'})
    public payerFsp: string;

    @Column({type: 'varchar', length: 32, name: 'payee_fsp'})
    public payeeFsp: string;

    @Column({type: 'bigint', name: 'correlation_id'})
    public correlationId: bigint;

    @Column({type: 'varchar', length: 64, name: 'transfer_id'})
    public transferId: string;

    @Column({type: 'jsonb', name: 'request'})
    public request: TransfersPostRequest;

    @Column({type: 'jsonb', name: 'response', nullable: true})
    public response: TransfersIDPutResponse | null;

    @Column({type: 'jsonb', name: 'error', nullable: true})
    public error: ErrorInformationObject | null;

    @Column({type: 'boolean', name: 'failed', default: false})
    public failed: boolean = false;

    @Column({type: 'timestamptz', name: 'created_at'})
    public createdAt: Date;

    @Column({type: 'timestamptz', name: 'completed_at'})
    public completedAt: Date;

    constructor(
        rail: string,
        payerFsp: string,
        payeeFsp: string,
        correlationId: bigint,
        transferId: string,
        request: TransfersPostRequest,
    ) {

        this.rail = rail;
        this.payerFsp = payerFsp;
        this.payeeFsp = payeeFsp;
        this.correlationId = correlationId;
        this.transferId = transferId;
        this.request = request;
        this.createdAt = new Date();
    }

    public complete(response: TransfersIDPutResponse | null): void {

        this.response = response ?? null;
        this.completedAt = new Date();
        this.error = null;
    }

    public fail(error: ErrorInformationObject): void {

        this.error = error;
        this.completedAt = new Date();
        this.response = null;
        this.failed = true;
    }
}
