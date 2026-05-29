import {BadRequestException, Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {ReportType} from '../../model';
import {ReportDownloadRepository} from '../../repository';
import {TransactionReportParams} from '../../reporting';
import {CreateTransactionReportCommand} from './create-transaction-report.command';

@CommandHandler(CreateTransactionReportCommand)
export class CreateTransactionReportHandler
    implements ICommandHandler<CreateTransactionReportCommand, CreateTransactionReportCommand.Output> {

    constructor(
        @Inject(ReportDownloadRepository)
        private readonly repository: ReportDownloadRepository,
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
}
