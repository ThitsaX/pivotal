import {Inject, Injectable, Logger} from '@nestjs/common';
import AdmZip = require('adm-zip');
import {TransactionRepository} from '../repository';
import {ReportDownloadRequest} from '../model';
import {REPORT_DOWNLOAD_SETTINGS} from './tokens';
import {ReportDownloadSettings} from './report-download-settings';
import {ReportFile} from './report-file';
import {TransactionReportParams} from './transaction-report-params';

type ReportFileType = 'csv' | 'xlsx';

@Injectable()
export class TransactionReportGenerator {

    private static readonly LOGGER = new Logger(TransactionReportGenerator.name);
    private static readonly XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    private static readonly XLSX_MAX_DATA_ROWS_PER_SHEET = 1_048_575;

    private static readonly COLUMNS = [
        'id',
        'transferId',
        'payerFsp',
        'payeeFsp',
        'payerIdType',
        'payerId',
        'payerSubId',
        'payeeIdType',
        'payeeId',
        'payeeSubId',
        'transactionInitiatorType',
        'quotingCurrency',
        'quotingAmount',
        'transferCurrency',
        'transferAmount',
        'transactionType',
        'subScenario',
        'transferState',
        'error',
        'dispute',
        'flow',
        'partiesRequestedAt',
        'partiesRespondedAt',
        'partiesRequest',
        'partiesResponse',
        'partiesError',
        'outboundPartiesRequestedAt',
        'outboundPartiesRespondedAt',
        'inboundPartiesRequestedAt',
        'inboundPartiesRespondedAt',
        'connectorPartiesRequestedAt',
        'connectorPartiesRespondedAt',
        'quotesRequestedAt',
        'quotesRespondedAt',
        'quotesRequest',
        'quotesResponse',
        'quotesError',
        'outboundQuotesRequestedAt',
        'outboundQuotesRespondedAt',
        'inboundQuotesRequestedAt',
        'inboundQuotesRespondedAt',
        'connectorQuotesRequestedAt',
        'connectorQuotesRespondedAt',
        'transfersRequestedAt',
        'transfersRespondedAt',
        'transfersRequest',
        'transfersResponse',
        'transfersError',
        'outboundTransfersRequestedAt',
        'outboundTransfersRespondedAt',
        'inboundTransfersRequestedAt',
        'inboundTransfersRespondedAt',
        'connectorTransfersRequestedAt',
        'connectorTransfersRespondedAt',
        'patchRequestedAt',
        'patchRespondedAt',
        'patchRequest',
        'patchError',
        'transactionStartedAt',
        'transactionCompletedAt',
        'createdAt',
        'updatedAt',
    ] as const;

    constructor(
        private readonly transactionRepository: TransactionRepository,
        @Inject(REPORT_DOWNLOAD_SETTINGS)
        private readonly settings: ReportDownloadSettings,
    ) {
    }

    async generate(request: ReportDownloadRequest, params: Record<string, string>): Promise<ReportFile> {
        const criteria = TransactionReportParams.toCriteria(params);
        const order = TransactionReportParams.toOrder(params);
        const accessScope = TransactionReportParams.toAccessScope(params);
        const totalRows = await this.transactionRepository.countForReport(criteria, accessScope);

        TransactionReportGenerator.LOGGER.log(
            `Generating transaction report requestId=${request.id} totalRows=${totalRows}`,
        );

        const fileType = TransactionReportGenerator.reportFileType(request.fileType);
        const maxRowsPerFile = this.maxRowsPerGeneratedFile(fileType);

        if (totalRows <= maxRowsPerFile) {
            return this.generateFile(fileType, criteria, order, accessScope, 0, totalRows);
        }

        const fileCount = Math.ceil(totalRows / maxRowsPerFile);

        if (fileCount > this.settings.maxZipFiles) {
            throw new Error(
                `Report has ${totalRows} rows and would create ${fileCount} files; maxZipFiles=${this.settings.maxZipFiles}.`,
            );
        }

        const zip = new AdmZip();

        for (let partNumber = 1, offset = 0; offset < totalRows; partNumber++, offset += maxRowsPerFile) {
            const rowsInPart = Math.min(maxRowsPerFile, totalRows - offset);
            const file = await this.generateFile(fileType, criteria, order, accessScope, offset, rowsInPart);

            zip.addFile(
                `TransactionDetailReport-${request.id}-Part${partNumber}.${file.extension}`,
                file.bytes,
            );

            TransactionReportGenerator.LOGGER.log(
                `Generated transaction report requestId=${request.id} part=${partNumber} rows=${rowsInPart}`,
            );
        }

        return new ReportFile(zip.toBuffer(), 'zip', 'application/zip');
    }

    private async generateFile(
        fileType: ReportFileType,
        criteria: Parameters<TransactionRepository['findForReport']>[0],
        order: Parameters<TransactionRepository['findForReport']>[1],
        accessScope: Parameters<TransactionRepository['findForReport']>[4],
        offset: number,
        rowCount: number,
    ): Promise<ReportFile> {
        if (fileType === 'xlsx') {
            const xlsx = await this.generateXlsx(criteria, order, accessScope, offset, rowCount);

            return new ReportFile(xlsx, 'xlsx', TransactionReportGenerator.XLSX_CONTENT_TYPE);
        }

        const csv = await this.generateCsv(criteria, order, accessScope, offset, rowCount);

        return new ReportFile(Buffer.from(csv, 'utf8'), 'csv', 'text/csv');
    }

    private async generateCsv(
        criteria: Parameters<TransactionRepository['findForReport']>[0],
        order: Parameters<TransactionRepository['findForReport']>[1],
        accessScope: Parameters<TransactionRepository['findForReport']>[4],
        offset: number,
        rowCount: number,
    ): Promise<string> {
        const lines = [TransactionReportGenerator.COLUMNS.join(',')];

        for (let currentOffset = offset; currentOffset < offset + rowCount; currentOffset += this.settings.pageSize) {
            const limit = Math.min(this.settings.pageSize, offset + rowCount - currentOffset);
            const rows = await this.transactionRepository.findForReport(
                criteria,
                order,
                currentOffset,
                limit,
                accessScope,
            );

            for (const row of rows) {
                lines.push(TransactionReportGenerator.COLUMNS
                    .map((column) => TransactionReportGenerator.csvValue(row[column]))
                    .join(','));
            }
        }

        return `${lines.join('\n')}\n`;
    }

    private async generateXlsx(
        criteria: Parameters<TransactionRepository['findForReport']>[0],
        order: Parameters<TransactionRepository['findForReport']>[1],
        accessScope: Parameters<TransactionRepository['findForReport']>[4],
        offset: number,
        rowCount: number,
    ): Promise<Buffer> {
        const sheetRows = [
            TransactionReportGenerator.xlsxRow(1, TransactionReportGenerator.COLUMNS),
        ];
        let sheetRowNumber = 2;

        for (let currentOffset = offset; currentOffset < offset + rowCount; currentOffset += this.settings.pageSize) {
            const limit = Math.min(this.settings.pageSize, offset + rowCount - currentOffset);
            const rows = await this.transactionRepository.findForReport(
                criteria,
                order,
                currentOffset,
                limit,
                accessScope,
            );

            for (const row of rows) {
                sheetRows.push(TransactionReportGenerator.xlsxRow(
                    sheetRowNumber,
                    TransactionReportGenerator.COLUMNS.map((column) => row[column]),
                ));
                sheetRowNumber++;
            }
        }

        const zip = new AdmZip();

        zip.addFile('[Content_Types].xml', Buffer.from(TransactionReportGenerator.xlsxContentTypes(), 'utf8'));
        zip.addFile('_rels/.rels', Buffer.from(TransactionReportGenerator.xlsxRootRels(), 'utf8'));
        zip.addFile('xl/workbook.xml', Buffer.from(TransactionReportGenerator.xlsxWorkbook(), 'utf8'));
        zip.addFile('xl/_rels/workbook.xml.rels', Buffer.from(TransactionReportGenerator.xlsxWorkbookRels(), 'utf8'));
        zip.addFile('xl/styles.xml', Buffer.from(TransactionReportGenerator.xlsxStyles(), 'utf8'));
        zip.addFile('xl/worksheets/sheet1.xml', Buffer.from(TransactionReportGenerator.xlsxSheet(sheetRows), 'utf8'));

        return zip.toBuffer();
    }

    private maxRowsPerGeneratedFile(fileType: ReportFileType): number {
        if (fileType === 'xlsx') {
            return Math.min(
                this.settings.maxRowsPerFile,
                TransactionReportGenerator.XLSX_MAX_DATA_ROWS_PER_SHEET,
            );
        }

        return this.settings.maxRowsPerFile;
    }

    private static reportFileType(fileType: string): ReportFileType {
        return fileType.trim().toLowerCase() === 'xlsx' ? 'xlsx' : 'csv';
    }

    private static csvValue(value: unknown): string {
        if (value == null) {
            return '';
        }

        const normalized = value instanceof Date ? value.toISOString() : String(value);
        const escaped = normalized.replace(/"/g, '""');

        if (/[",\n\r]/.test(escaped)) {
            return `"${escaped}"`;
        }

        return escaped;
    }

    private static xlsxRow(rowNumber: number, values: readonly unknown[]): string {
        const cells = values
            .map((value, index) => TransactionReportGenerator.xlsxCell(rowNumber, index + 1, value))
            .join('');

        return `<row r="${rowNumber}">${cells}</row>`;
    }

    private static xlsxCell(rowNumber: number, columnNumber: number, value: unknown): string {
        const reference = `${TransactionReportGenerator.xlsxColumnName(columnNumber)}${rowNumber}`;

        if (value == null) {
            return `<c r="${reference}"/>`;
        }

        if (typeof value === 'number' && Number.isFinite(value)) {
            return `<c r="${reference}"><v>${value}</v></c>`;
        }

        const normalized = value instanceof Date ? value.toISOString() : String(value);

        return `<c r="${reference}" t="inlineStr"><is><t>${TransactionReportGenerator.xmlValue(normalized)}</t></is></c>`;
    }

    private static xlsxColumnName(columnNumber: number): string {
        let current = columnNumber;
        let name = '';

        while (current > 0) {
            const remainder = (current - 1) % 26;
            name = String.fromCharCode(65 + remainder) + name;
            current = Math.floor((current - 1) / 26);
        }

        return name;
    }

    private static xlsxSheet(rows: string[]): string {
        return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetData>${rows.join('')}</sheetData>
</worksheet>`;
    }

    private static xlsxContentTypes(): string {
        return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;
    }

    private static xlsxRootRels(): string {
        return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
    }

    private static xlsxWorkbook(): string {
        return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Transactions" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;
    }

    private static xlsxWorkbookRels(): string {
        return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
    }

    private static xlsxStyles(): string {
        return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="1"><fill><patternFill patternType="none"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
</styleSheet>`;
    }

    private static xmlValue(value: string): string {
        return value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }
}
