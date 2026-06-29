import {Inject} from '@nestjs/common';
import {IQueryHandler, QueryHandler} from '@nestjs/cqrs';
import {ReportDownloadRepository} from '../repository';
import {GetReportDownloadStatusQuery} from './get-report-download-status.query';

@QueryHandler(GetReportDownloadStatusQuery)
export class GetReportDownloadStatusHandler
    implements IQueryHandler<GetReportDownloadStatusQuery, GetReportDownloadStatusQuery.Output> {

    constructor(
        @Inject(ReportDownloadRepository)
        private readonly repository: ReportDownloadRepository,
    ) {
    }

    async execute(query: GetReportDownloadStatusQuery): Promise<GetReportDownloadStatusQuery.Output> {
        const request = await this.repository.findById(query.input.requestId, query.input.accessScope);

        if (request == null) {
            return new GetReportDownloadStatusQuery.Output(query.input.requestId, false, null, null);
        }

        return new GetReportDownloadStatusQuery.Output(
            request.id,
            true,
            request.status,
            request.errorMessage,
        );
    }
}
