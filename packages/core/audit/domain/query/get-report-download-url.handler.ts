import {Inject} from '@nestjs/common';
import {IQueryHandler, QueryHandler} from '@nestjs/cqrs';
import {ReportDownloadStatus} from '../model';
import {ReportDownloadRepository} from '../repository';
import {S3ReportStorage} from '../reporting';
import {GetReportDownloadUrlQuery} from './get-report-download-url.query';

@QueryHandler(GetReportDownloadUrlQuery)
export class GetReportDownloadUrlHandler
    implements IQueryHandler<GetReportDownloadUrlQuery, GetReportDownloadUrlQuery.Output> {

    constructor(
        @Inject(ReportDownloadRepository)
        private readonly repository: ReportDownloadRepository,
        private readonly storage: S3ReportStorage,
    ) {
    }

    async execute(query: GetReportDownloadUrlQuery): Promise<GetReportDownloadUrlQuery.Output> {
        const request = await this.repository.findById(query.input.requestId, query.input.accessScope);

        if (request == null) {
            return new GetReportDownloadUrlQuery.Output(query.input.requestId, false, null, null, null, null);
        }

        let downloadUrl: string | null = null;

        if (request.status === ReportDownloadStatus.Ready && request.fileKey != null) {
            downloadUrl = await this.storage.presignedDownloadUrl(request.fileKey);
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
