import {BadRequestException, Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {ReportType} from '../../model';
import {ReportDownloadRepository, TransactionRepository} from '../../repository';
import {REPORT_DOWNLOAD_SETTINGS, ReportDownloadSettings, TransactionReportParams} from '../../reporting';
import {CreateTransactionReportCommand} from './create-transaction-report.command';

@CommandHandler(CreateTransactionReportCommand)
export class CreateTransactionReportHandler
    implements ICommandHandler<CreateTransactionReportCommand, CreateTransactionReportCommand.Output> {

    private static readonly XLSX_MAX_DATA_ROWS_PER_SHEET = 1_048_575;

    constructor(
        @Inject(ReportDownloadRepository)
        private readonly repository: ReportDownloadRepository,
        @Inject(TransactionRepository)
        private readonly transactionRepository: TransactionRepository,
        @Inject(REPORT_DOWNLOAD_SETTINGS)
        private readonly settings: ReportDownloadSettings,
    ) {
    }

    async execute(command: CreateTransactionReportCommand): Promise<CreateTransactionReportCommand.Output> {
        const fileType = command.input.fileType.trim().toLowerCase();

        if (fileType !== 'csv' && fileType !== 'xlsx') {
            throw new BadRequestException({
                code:    'REPORT_FILE_TYPE_NOT_SUPPORTED',
                message: 'Only csv and xlsx transaction report downloads are currently supported.',
            });
        }

        const params = TransactionReportParams.fromInput(
            command.input.criteria,
            command.input.order,
            command.input.accessScope,
        );
        const maxRows = CreateTransactionReportHandler.maxDownloadRows(fileType, this.settings);
        const {capped} = await this.transactionRepository.countForReport(
            command.input.criteria,
            maxRows,
            command.input.accessScope,
        );

        if (capped) {
            throw new BadRequestException({
                code:    'REPORT_RESULT_SIZE_EXCEEDED',
                message: `This search exceeds the maximum downloadable size of ${maxRows} rows. Narrow your filters.`,
            });
        }

        const request = await this.repository.createPending({
            reportType:        ReportType.TransactionDetail,
            fileType,
            params,
            requestedByUserId: command.input.requestedByUserId,
            requestedByFspId:  command.input.accessScope?.fspId,
        });

        return new CreateTransactionReportCommand.Output(
            request.id,
            request.status,
            request.paramsSignature,
        );
    }

    private static maxDownloadRows(fileType: string, settings: ReportDownloadSettings): number {
        const maxRowsPerFile = fileType === 'xlsx'
            ? Math.min(settings.maxRowsPerFile, CreateTransactionReportHandler.XLSX_MAX_DATA_ROWS_PER_SHEET)
            : settings.maxRowsPerFile;

        return Math.min(
            maxRowsPerFile * settings.maxZipFiles,
            ReportDownloadSettings.MAX_DOWNLOAD_ROWS,
        );
    }
}
