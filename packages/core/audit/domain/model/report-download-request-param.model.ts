// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Column, Entity, Index, PrimaryColumn} from 'typeorm';

@Entity({name: 'report_download_request_params'})
@Index('report_download_request_params_01_idx', ['requestId'])
export class ReportDownloadRequestParam {

    @PrimaryColumn({type: 'bigint', name: 'id'})
    public id!: string;

    @Column({type: 'bigint', name: 'request_id'})
    public requestId!: string;

    @Column({type: 'varchar', length: 128, name: 'param_key'})
    public paramKey!: string;

    @Column({type: 'text', name: 'param_value', nullable: true})
    public paramValue!: string | null;

    @Column({type: 'datetime', name: 'created_at'})
    public createdAt!: Date;
}
