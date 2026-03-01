import {TransfersPostRequest} from '@shared/fspiop';
import {Column, Entity, Index, PrimaryColumn} from 'typeorm';

@Entity({name: 'outbound_transfers_request'})
@Index('outbound_transfers_request_01_idx', ['correlationId'])
@Index('outbound_transfers_request_02_idx', ['transferId'])
@Index('outbound_transfers_request_03_idx', ['createdAt'])
@Index('outbound_transfers_request_04_idx', ['payerFsp', 'payeeFsp'])
@Index('outbound_transfers_request_05_idx', ['rail'])
export class OutboundTransfersRequest {

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

    @Column({type: 'varchar', length: 64, name: 'transfer_id'})
    public transferId: string;

    @Column({type: 'jsonb', name: 'request'})
    public request: TransfersPostRequest;

    @Column({type: 'timestamptz', name: 'created_at'})
    public createdAt: Date;

    constructor(
        id: string,
        rail: string,
        payerFsp: string,
        payeeFsp: string,
        correlationId: bigint,
        transferId: string,
        request: TransfersPostRequest,
    ) {

        this.id = id;
        this.rail = rail;
        this.payerFsp = payerFsp;
        this.payeeFsp = payeeFsp;
        this.correlationId = correlationId;
        this.transferId = transferId;
        this.request = request;
        this.createdAt = new Date();
    }
}
