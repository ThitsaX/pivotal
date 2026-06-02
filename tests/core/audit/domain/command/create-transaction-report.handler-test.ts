import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {BadRequestException} from '@nestjs/common';
import AdmZip = require('adm-zip');
import {
    CreateTransactionReportCommand,
    CreateTransactionReportHandler,
    FindTransactionsQuery,
    ReportDownloadRequest,
    ReportDownloadRepository,
    ReportDownloadSettings,
    ReportDownloadStatus,
    ReportType,
    TransactionReportGenerator,
    TransactionRepository,
} from '../../../../../packages/core/audit/domain';

describe('CreateTransactionReportHandler', () => {

    it('creates a pending CSV report request from transaction search criteria', async () => {
        let capturedInput: ReportDownloadRepository.CreatePendingInput | undefined;
        const repository = {
            async createPending(input: ReportDownloadRepository.CreatePendingInput) {
                capturedInput = input;
                return {
                    id:              '1001',
                    status:          ReportDownloadStatus.Pending,
                    paramsSignature: 'sig-1',
                };
            },
        } as unknown as ReportDownloadRepository;
        const handler = new CreateTransactionReportHandler(repository);

        const output = await handler.execute(new CreateTransactionReportCommand(
            new CreateTransactionReportCommand.Input(
                new FindTransactionsQuery.Criteria(
                    'wallet1',
                    undefined,
                    undefined,
                    '2769100001',
                ),
                new FindTransactionsQuery.Order(),
                'CSV',
                'user-1',
                new FindTransactionsQuery.AccessScope('wallet1'),
            ),
        ));

        assert.equal(output.requestId, '1001');
        assert.equal(output.status, ReportDownloadStatus.Pending);
        assert.equal(output.paramsSignature, 'sig-1');
        assert.equal(capturedInput?.reportType, ReportType.TransactionDetail);
        assert.equal(capturedInput?.fileType, 'csv');
        assert.equal(capturedInput?.requestedByUserId, 'user-1');
        assert.equal(capturedInput?.requestedByFspId, 'wallet1');
        assert.equal(capturedInput?.params.payerFsp, 'wallet1');
        assert.equal(capturedInput?.params.payerId, '2769100001');
        assert.equal(capturedInput?.params.accessFspId, 'wallet1');
    });

    it('creates a pending XLSX report request', async () => {
        let capturedInput: ReportDownloadRepository.CreatePendingInput | undefined;
        const repository = {
            async createPending(input: ReportDownloadRepository.CreatePendingInput) {
                capturedInput = input;
                return {
                    id:              '1002',
                    status:          ReportDownloadStatus.Pending,
                    paramsSignature: 'sig-2',
                };
            },
        } as unknown as ReportDownloadRepository;
        const handler = new CreateTransactionReportHandler(repository);

        const output = await handler.execute(new CreateTransactionReportCommand(
            new CreateTransactionReportCommand.Input(
                new FindTransactionsQuery.Criteria(),
                new FindTransactionsQuery.Order(),
                'XLSX',
            ),
        ));

        assert.equal(output.requestId, '1002');
        assert.equal(capturedInput?.fileType, 'xlsx');
    });

    it('rejects unsupported file types', async () => {
        const handler = new CreateTransactionReportHandler({} as ReportDownloadRepository);

        await assert.rejects(
            handler.execute(new CreateTransactionReportCommand(
                new CreateTransactionReportCommand.Input(
                    new FindTransactionsQuery.Criteria(),
                    new FindTransactionsQuery.Order(),
                    'pdf',
                ),
            )),
            (error: unknown) => error instanceof BadRequestException
                && (error.getResponse() as {code: string}).code === 'REPORT_FILE_TYPE_NOT_SUPPORTED',
        );
    });

    it('generates a single XLSX transaction report', async () => {
        const generator = new TransactionReportGenerator(
            reportTransactionRepository([
                {
                    id:             '1',
                    transferId:     'transfer-1',
                    payerFsp:       'wallet1',
                    payeeFsp:       'wallet2',
                    transferAmount: '12.34',
                    transferState:  'COMMITTED',
                },
            ]),
            new ReportDownloadSettings(),
        );

        const report = await generator.generate(reportRequest('xlsx'), {});
        const xlsx = new AdmZip(report.bytes);
        const sheet = xlsx.readAsText('xl/worksheets/sheet1.xml');

        assert.equal(report.extension, 'xlsx');
        assert.equal(report.contentType, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        assert.match(sheet, /transferId/);
        assert.match(sheet, /transfer-1/);
        assert.match(sheet, /wallet1/);
        assert.match(sheet, /wallet2/);
    });

    it('includes raw request and response JSON in CSV reports for disputed transactions', async () => {
        const generator = new TransactionReportGenerator(
            reportTransactionRepository([
                {
                    id:                '1',
                    transferId:        'transfer-disputed',
                    dispute:           true,
                    partiesRequest:    JSON.stringify({partyId: '2769200001'}),
                    partiesResponse:   JSON.stringify({fspId: 'wallet2'}),
                    quotesRequest:     JSON.stringify({amount: {amount: '12.34', currency: 'USD'}}),
                    quotesResponse:    JSON.stringify({transferAmount: {amount: '12.34', currency: 'USD'}}),
                    transfersRequest:  JSON.stringify({transferId: 'transfer-disputed'}),
                    transfersResponse: JSON.stringify({transferState: 'COMMITTED'}),
                    patchRequest:      JSON.stringify({transferState: 'COMMITTED'}),
                    patchError:        JSON.stringify({errorCode: '2001'}),
                },
            ]),
            new ReportDownloadSettings(),
        );

        const report = await generator.generate(reportRequest('csv'), {});
        const csv = report.bytes.toString('utf8');

        assert.equal(report.extension, 'csv');
        assert.match(csv, /partiesRequest/);
        assert.match(csv, /transfersResponse/);
        assert.match(csv, /"\{""partyId"":""2769200001""\}"/);
        assert.match(csv, /"\{""transferState"":""COMMITTED""\}"/);
        assert.match(csv, /"\{""errorCode"":""2001""\}"/);
    });

    it('keeps raw request and response CSV columns empty for non-disputed transactions', async () => {
        const generator = new TransactionReportGenerator(
            reportTransactionRepository([
                {
                    id:                '1',
                    transferId:        'transfer-normal',
                    dispute:           false,
                    partiesRequest:    null,
                    partiesResponse:   null,
                    quotesRequest:     null,
                    quotesResponse:    null,
                    transfersRequest:  null,
                    transfersResponse: null,
                    patchRequest:      null,
                    patchError:        null,
                },
            ]),
            new ReportDownloadSettings(),
        );

        const report = await generator.generate(reportRequest('csv'), {});
        const [header, row] = report.bytes.toString('utf8').trimEnd().split('\n');
        const headers = header.split(',');
        const values = row.split(',');

        for (const column of ['partiesRequest', 'quotesRequest', 'transfersRequest', 'patchRequest', 'patchError']) {
            assert.equal(values[headers.indexOf(column)], '');
        }
    });

    it('splits large XLSX transaction reports into a ZIP of XLSX parts', async () => {
        const generator = new TransactionReportGenerator(
            reportTransactionRepository([
                {id: '1', transferId: 'transfer-1'},
                {id: '2', transferId: 'transfer-2'},
            ]),
            new ReportDownloadSettings(
                false,
                5000,
                1,
                1,
            ),
        );

        const report = await generator.generate(reportRequest('xlsx'), {});
        const zip = new AdmZip(report.bytes);
        const entries = zip.getEntries().map((entry) => entry.entryName).sort();

        assert.equal(report.extension, 'zip');
        assert.deepEqual(entries, [
            'TransactionDetailReport-1001-Part1.xlsx',
            'TransactionDetailReport-1001-Part2.xlsx',
        ]);
    });
});

function reportRequest(fileType: string): ReportDownloadRequest {
    const request = new ReportDownloadRequest();

    request.id = '1001';
    request.reportType = ReportType.TransactionDetail;
    request.status = ReportDownloadStatus.Pending;
    request.fileType = fileType;

    return request;
}

function reportTransactionRepository(rows: Record<string, unknown>[]): TransactionRepository {
    return {
        async countForReport() {
            return rows.length;
        },
        async findForReport(
            _criteria: FindTransactionsQuery.Criteria,
            _order: FindTransactionsQuery.Order,
            offset: number,
            limit: number,
        ) {
            return rows.slice(offset, offset + limit);
        },
    } as unknown as TransactionRepository;
}
