import {Column, Entity, Index, PrimaryColumn} from 'typeorm';
import {ReportDownloadStatus, ReportType} from './report-download-status';

@Entity({name: 'report_download_requests'})
@Index('report_download_requests_01_idx', ['status', 'createdAt'])
@Index('report_download_requests_02_idx', ['status', 'updatedAt'])
@Index('report_download_requests_03_idx', ['requestedByFspId', 'createdAt'])
export class ReportDownloadRequest {

    @PrimaryColumn({type: 'bigint', name: 'id'})
    public id!: string;

    @Column({type: 'varchar', length: 64, name: 'report_type'})
    public reportType!: ReportType;

    @Column({type: 'varchar', length: 128, name: 'params_signature'})
    public paramsSignature!: string;

    @Column({type: 'varchar', length: 16, name: 'status'})
    public status!: ReportDownloadStatus;

    @Column({type: 'varchar', length: 16, name: 'file_type'})
    public fileType!: string;

    @Column({type: 'varchar', length: 1024, name: 'file_key', nullable: true})
    public fileKey!: string | null;

    @Column({type: 'text', name: 'error_message', nullable: true})
    public errorMessage!: string | null;

    @Column({type: 'varchar', length: 128, name: 'requested_by_user_id', nullable: true})
    public requestedByUserId!: string | null;

    @Column({type: 'varchar', length: 32, name: 'requested_by_fsp_id', nullable: true})
    public requestedByFspId!: string | null;

    @Column({type: 'datetime', name: 'finished_at', nullable: true})
    public finishedAt!: Date | null;

    @Column({type: 'datetime', name: 'created_at'})
    public createdAt!: Date;

    @Column({type: 'datetime', name: 'updated_at'})
    public updatedAt!: Date;
}
