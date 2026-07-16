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
    TransactionReportParams,
    TransactionRepository,
} from '../../../../../packages/core/audit/domain';

function parseCsvRecord(record: string): string[] {
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let index = 0; index < record.length; index += 1) {
        const char = record[index];

        if (char === '"') {
            if (inQuotes && record[index + 1] === '"') {
                current += '"';
                index += 1;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            fields.push(current);
            current = '';
        } else {
            current += char;
        }
    }

    fields.push(current);

    return fields;
}

describe('CreateTransactionReportHandler', () => {

    it('round-trips home transaction ID filters through report parameters', () => {
        const criteria = new FindTransactionsQuery.Criteria(
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            'payer-home-1',
            'payee-home-1',
        );

        const params = TransactionReportParams.fromInput(criteria, new FindTransactionsQuery.Order());
        const restored = TransactionReportParams.toCriteria(params);

        assert.equal(params.payerHomeTransactionId, 'payer-home-1');
        assert.equal(params.payeeHomeTransactionId, 'payee-home-1');
        assert.equal(restored.payerHomeTransactionId, 'payer-home-1');
        assert.equal(restored.payeeHomeTransactionId, 'payee-home-1');
    });

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
        const handler = new CreateTransactionReportHandler(
            repository,
            reportTransactionRepository([]),
            new ReportDownloadSettings(),
        );

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
        const handler = new CreateTransactionReportHandler(
            repository,
            reportTransactionRepository([]),
            new ReportDownloadSettings(),
        );

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
        const handler = new CreateTransactionReportHandler(
            {} as ReportDownloadRepository,
            reportTransactionRepository([]),
            new ReportDownloadSettings(),
        );

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

    it('caps report downloads at 50,000 rows even when file settings allow more', async () => {
        const rows = Array.from({length: ReportDownloadSettings.MAX_DOWNLOAD_ROWS + 1}, (_, index) => ({
            id:         String(index + 1),
            transferId: `transfer-${index + 1}`,
        }));
        const handler = new CreateTransactionReportHandler(
            {} as ReportDownloadRepository,
            reportTransactionRepository(rows),
            new ReportDownloadSettings(
                true,
                5000,
                50000,
                500000,
                20,
            ),
        );

        await assert.rejects(
            handler.execute(new CreateTransactionReportCommand(
                new CreateTransactionReportCommand.Input(
                    new FindTransactionsQuery.Criteria(),
                    new FindTransactionsQuery.Order(),
                    'xlsx',
                ),
            )),
            (error: unknown) => error instanceof BadRequestException
                && (error.getResponse() as {code: string}).code === 'REPORT_RESULT_SIZE_EXCEEDED',
        );
    });

    it('generates an XLSX transaction report zip', async () => {
        const generator = new TransactionReportGenerator(
            reportTransactionRepository([
                {
                    id:              '1',
                    transferId:      'transfer-1',
                    payerFsp:        'wallet1',
                    payeeFsp:        'wallet2',
                    payerIdType:     'MSISDN',
                    payerId:         '2769100001',
                    payeeIdType:     'MSISDN',
                    payeeId:         '2769200001',
                    quotingCurrency: 'USD',
                    quotingAmount:   '12.34',
                    transferState:   'COMMITTED',
                },
            ]),
            new ReportDownloadSettings(),
        );

        const report = await generator.generate(reportRequest('xlsx'), {});
        const zip = new AdmZip(report.bytes);
        const xlsxEntry = zip.getEntry('TransactionReport-1001-Part1.xlsx');

        assert.notEqual(xlsxEntry, null);

        const xlsx = new AdmZip(xlsxEntry!.getData());
        const sheet = xlsx.readAsText('xl/worksheets/sheet1.xml');

        assert.equal(report.extension, 'zip');
        assert.equal(report.contentType, 'application/zip');
        assert.match(sheet, /Transfer ID/);
        assert.match(sheet, /transfer-1/);
        assert.match(sheet, /wallet1/);
        assert.match(sheet, /wallet2/);
        assert.match(sheet, /2769100001/);
        assert.match(sheet, /2769200001/);
    });

    it('includes serialized error JSON in CSV reports', async () => {
        const generator = new TransactionReportGenerator(
            reportTransactionRepository([
                {
                    id:             '1',
                    transferId:     'transfer-disputed',
                    dispute:        true,
                    partiesError:   JSON.stringify({partyId: '2769200001'}),
                    quotesError:    JSON.stringify({amount: {amount: '12.34', currency: 'USD'}}),
                    transfersError: JSON.stringify({transferState: 'ABORTED'}),
                    patchError:     JSON.stringify({
                        errorCode:    '2001',
                        responseBody: 'dispute patch response',
                    }),
                },
            ]),
            new ReportDownloadSettings(),
        );

        const report = await generator.generate(reportRequest('csv'), {});
        const csv = report.bytes.toString('utf8');

        assert.equal(report.extension, 'csv');
        assert.match(csv, /Account Lookup Error/);
        assert.match(csv, /Transfer Call Error/);
        assert.match(csv, /"\{""partyId"":""2769200001""\}"/);
        assert.match(csv, /"\{""transferState"":""ABORTED""\}"/);
        assert.match(csv, /dispute patch response/);
    });

    it('includes fee and amount fields in CSV reports', async () => {
        const generator = new TransactionReportGenerator(
            reportTransactionRepository([
                {
                    id:                 '1',
                    transferId:         'transfer-with-fees',
                    payeeFee:           262,
                    payerFee:           613,
                    schemeFee:          125,
                    payeeReceiveAmount: 9000,
                    transferAmount:     10000,
                },
                {
                    id:         '2',
                    transferId: 'transfer-without-fees',
                },
                {
                    id:                 '3',
                    transferId:         'transfer-with-zero-fees',
                    payeeFee:           0,
                    payerFee:           0,
                    schemeFee:          0,
                    payeeReceiveAmount: 0,
                    transferAmount:     0,
                },
            ]),
            new ReportDownloadSettings(),
        );

        const report = await generator.generate(reportRequest('csv'), {});
        const [header, firstRow, secondRow, thirdRow] = report.bytes.toString('utf8').trimEnd().split('\n');
        const headers = header.split(',');
        const firstValues = firstRow.split(',');
        const secondValues = secondRow.split(',');
        const thirdValues = thirdRow.split(',');

        assert.deepEqual(
            [
                headers.indexOf('Payee Fee'),
                headers.indexOf('Payer Fee'),
                headers.indexOf('Scheme Fee'),
                headers.indexOf('Payee Receive Amount'),
                headers.indexOf('Transfer Amount'),
            ].map((index) => firstValues[index]),
            ['262', '613', '125', '9000', '10000'],
        );
        assert.deepEqual(
            [
                headers.indexOf('Payee Fee'),
                headers.indexOf('Payer Fee'),
                headers.indexOf('Scheme Fee'),
                headers.indexOf('Payee Receive Amount'),
                headers.indexOf('Transfer Amount'),
            ].map((index) => secondValues[index]),
            ['-', '-', '-', '-', '-'],
        );
        assert.deepEqual(
            [
                headers.indexOf('Payee Fee'),
                headers.indexOf('Payer Fee'),
                headers.indexOf('Scheme Fee'),
                headers.indexOf('Payee Receive Amount'),
                headers.indexOf('Transfer Amount'),
            ].map((index) => thirdValues[index]),
            ['0', '0', '0', '0', '0'],
        );
    });

    it('escapes serialized JSON values with commas and quotes in CSV reports', async () => {
        const partiesError = JSON.stringify({
            errorInformation: {
                errorCode:        '3200',
                errorDescription: 'Payee lookup failed, retry later',
                detail:           'Wallet said "not found"',
            },
        });
        const quotesError = JSON.stringify({
            message: 'Fee rule failed, amount is invalid',
            reason:  'Expected "USD" quote currency',
        });
        const generator = new TransactionReportGenerator(
            reportTransactionRepository([
                {
                    id:           '1',
                    transferId:   'transfer-json-comma',
                    partiesError,
                    quotesError,
                    transfersError: JSON.stringify({
                        transferState: 'ABORTED',
                        note:          'Rejected, no liquidity',
                    }),
                },
            ]),
            new ReportDownloadSettings(),
        );

        const report = await generator.generate(reportRequest('csv'), {});
        const [headerLine, rowLine] = report.bytes.toString('utf8').trimEnd().split('\n');
        const headers = parseCsvRecord(headerLine);
        const values = parseCsvRecord(rowLine);

        assert.equal(values.length, headers.length);
        assert.equal(values[headers.indexOf('Account Lookup Error')], partiesError);
        assert.equal(values[headers.indexOf('Quote Call Error')], quotesError);
        assert.equal(
            values[headers.indexOf('Transfer Call Error')],
            JSON.stringify({
                transferState: 'ABORTED',
                note:          'Rejected, no liquidity',
            }),
        );
    });

    it('omits patch response body in CSV reports when the row is not disputed', async () => {
        const generator = new TransactionReportGenerator(
            reportTransactionRepository([
                {
                    id:         '1',
                    transferId: 'transfer-normal',
                    dispute:    false,
                    patchError: JSON.stringify({
                        code:         'PAYEE_ERROR',
                        message:      'Payee failed',
                        responseBody: 'large non-dispute patch response',
                    }),
                },
            ]),
            new ReportDownloadSettings(),
        );

        const report = await generator.generate(reportRequest('csv'), {});
        const csv = report.bytes.toString('utf8');

        assert.doesNotMatch(csv, /Account Lookup Response/);
        assert.doesNotMatch(csv, /Quote Response/);
        assert.doesNotMatch(csv, /Transfer Response/);
        assert.match(csv, /Payee failed/);
        assert.doesNotMatch(csv, /large non-dispute patch response/);
    });

    it('keeps error CSV columns empty when no errors exist', async () => {
        const generator = new TransactionReportGenerator(
            reportTransactionRepository([
                {
                    id:             '1',
                    transferId:     'transfer-normal',
                    dispute:        false,
                    partiesError:   null,
                    quotesError:    null,
                    transfersError: null,
                    patchError:     null,
                },
            ]),
            new ReportDownloadSettings(),
        );

        const report = await generator.generate(reportRequest('csv'), {});
        const [header, row] = report.bytes.toString('utf8').trimEnd().split('\n');
        const headers = header.split(',');
        const values = row.split(',');

        for (const column of [
            'Account Lookup Error',
            'Quote Call Error',
            'Transfer Call Error',
            'Patch Call Error',
        ]) {
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
                2,
            ),
        );

        const report = await generator.generate(reportRequest('xlsx'), {});
        const zip = new AdmZip(report.bytes);
        const entries = zip.getEntries().map((entry) => entry.entryName).sort();

        assert.equal(report.extension, 'zip');
        assert.deepEqual(entries, [
            'TransactionReport-1001-Part1.xlsx',
            'TransactionReport-1001-Part2.xlsx',
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
        async countForReport(_criteria: FindTransactionsQuery.Criteria, maxLimit: number) {
            return {
                count:  Math.min(rows.length, maxLimit),
                capped: rows.length > maxLimit,
            };
        },
        async findForReport(
            _criteria: FindTransactionsQuery.Criteria,
            _order: FindTransactionsQuery.Order,
            cursor: string | undefined,
            limit: number,
        ) {
            const offset = cursor == null ? 0 : Number(Buffer.from(cursor, 'base64').toString('utf8'));
            const records = rows.slice(offset, offset + limit);
            const nextOffset = offset + records.length;
            const nextCursor = nextOffset < rows.length
                ? Buffer.from(String(nextOffset), 'utf8').toString('base64')
                : undefined;

            return {records, nextCursor};
        },
    } as unknown as TransactionRepository;
}
