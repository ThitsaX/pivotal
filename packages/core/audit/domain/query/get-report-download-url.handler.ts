// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {Inject} from '@nestjs/common';
import {IQueryHandler, QueryHandler} from '@nestjs/cqrs';
import {ReportDownloadStatus} from '../model';
import {ReportDownloadRepository} from '../repository';
import {GetReportDownloadUrlQuery} from './get-report-download-url.query';

@QueryHandler(GetReportDownloadUrlQuery)
export class GetReportDownloadUrlHandler
    implements IQueryHandler<GetReportDownloadUrlQuery, GetReportDownloadUrlQuery.Output> {

    constructor(
        @Inject(ReportDownloadRepository)
        private readonly repository: ReportDownloadRepository,
    ) {
    }

    async execute(query: GetReportDownloadUrlQuery): Promise<GetReportDownloadUrlQuery.Output> {
        const request = await this.repository.findById(query.input.requestId, query.input.accessScope);

        if (request == null) {
            return new GetReportDownloadUrlQuery.Output(query.input.requestId, false, null, null, null, null);
        }

        let downloadUrl: string | null = null;

        if (request.status === ReportDownloadStatus.Ready && request.fileKey != null) {
            downloadUrl = query.input.downloadUrl;
        }

        return new GetReportDownloadUrlQuery.Output(
            request.id,
            true,
            request.status,
            downloadUrl,
            request.fileKey,
            request.errorMessage,
        );
    }
}
