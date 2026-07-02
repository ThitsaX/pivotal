import {Inject, Injectable, Logger} from '@nestjs/common';
import AdmZip = require('adm-zip');
import {TransactionRepository} from '../repository';
import {ReportDownloadRequest} from '../model';
import {REPORT_DOWNLOAD_SETTINGS} from './tokens';
import {ReportDownloadSettings} from './report-download-settings';
import {ReportFile} from './report-file';
import {TransactionReportParams} from './transaction-report-params';

type ReportFileType = 'csv' | 'xlsx';

type ReportColumn = {
    header: string;
    key: string;
};

@Injectable()
export class TransactionReportGenerator {

    private static readonly LOGGER = new Logger(TransactionReportGenerator.name);
    private static readonly XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    private static readonly XLSX_MAX_DATA_ROWS_PER_SHEET = 1_048_575;

    private static readonly COLUMNS: readonly ReportColumn[] = [
        {header: 'Transfer ID', key: 'transferId'},
        {header: 'Payer FSP ID', key: 'payerFsp'},
        {header: 'Payee FSP ID', key: 'payeeFsp'},
        {header: 'Payer ID Type', key: 'payerIdType'},
        {header: 'Payer ID', key: 'payerId'},
        {header: 'Payer Sub ID', key: 'payerSubId'},
        {header: 'Payee ID Type', key: 'payeeIdType'},
        {header: 'Payee ID', key: 'payeeId'},
        {header: 'Payee Sub ID', key: 'payeeSubId'},
        {header: 'Currency', key: 'quotingCurrency'},
        {header: 'Amount', key: 'quotingAmount'},
        {header: 'Payee Fee', key: 'payeeFee'},
        {header: 'Payer Fee', key: 'payerFee'},
        {header: 'Scheme Fee', key: 'schemeFee'},
        {header: 'Payee Receive Amount', key: 'payeeReceiveAmount'},
        {header: 'Transfer Amount', key: 'transferAmount'},
        {header: 'Transfer State in Hub', key: 'transferState'},
        {header: 'Disputed', key: 'dispute'},
        {header: 'Account Lookup Error', key: 'partiesError'},
        {header: 'Quote Call Error', key: 'quotesError'},
        {header: 'Transfer Call Error', key: 'transfersError'},
        {header: 'Patch Call Error', key: 'patchError'},
    ];

    private static readonly NULL_TEXT_COLUMN_KEYS = new Set([
        'payeeFee',
        'payerFee',
        'schemeFee',
        'payeeReceiveAmount',
        'transferAmount',
    ]);

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
        const fileType = TransactionReportGenerator.reportFileType(request.fileType);
        const maxRowsPerFile = this.maxRowsPerGeneratedFile(fileType);
        const maxRows = this.maxDownloadRows(fileType);
        const {count: totalRows, capped} = await this.transactionRepository.countForReport(
            criteria,
            maxRows,
            accessScope,
        );

        if (capped) {
            throw new Error(`Report exceeds maximum downloadable rows (${maxRows}). Narrow the search filters.`);
        }

        TransactionReportGenerator.LOGGER.log(
            `Generating transaction report requestId=${request.id} totalRows=${totalRows}`,
        );

        if (fileType === 'xlsx') {
            return this.generateXlsxZip(request, criteria, order, accessScope, totalRows, maxRowsPerFile);
        }

        return this.generateCsvReport(request, criteria, order, accessScope, totalRows, maxRowsPerFile);
    }

    private async generateCsvReport(
        request: ReportDownloadRequest,
        criteria: Parameters<TransactionRepository['findForReport']>[0],
        order: Parameters<TransactionRepository['findForReport']>[1],
        accessScope: Parameters<TransactionRepository['findForReport']>[4],
        totalRows: number,
        maxRowsPerFile: number,
    ): Promise<ReportFile> {
        if (totalRows <= maxRowsPerFile) {
            const part = await this.generateCsvPart(criteria, order, accessScope, undefined, totalRows);

            return new ReportFile(Buffer.from(part.content, 'utf8'), 'csv', 'text/csv');
        }

        const zip = new AdmZip();
        let cursor: string | undefined;
        let writtenRows = 0;
        let partNumber = 1;

        while (writtenRows < totalRows) {
            const rowsInPart = Math.min(maxRowsPerFile, totalRows - writtenRows);
            const part = await this.generateCsvPart(criteria, order, accessScope, cursor, rowsInPart);

            zip.addFile(
                `TransactionReport-${request.id}-Part${partNumber}.csv`,
                Buffer.from(part.content, 'utf8'),
            );

            writtenRows += part.rowCount;
            cursor = part.nextCursor;
            partNumber++;

            if (part.rowCount === 0 || cursor == null) {
                break;
            }
        }

        return new ReportFile(zip.toBuffer(), 'zip', 'application/zip');
    }

    private async generateXlsxZip(
        request: ReportDownloadRequest,
        criteria: Parameters<TransactionRepository['findForReport']>[0],
        order: Parameters<TransactionRepository['findForReport']>[1],
        accessScope: Parameters<TransactionRepository['findForReport']>[4],
        totalRows: number,
        maxRowsPerFile: number,
    ): Promise<ReportFile> {
        const zip = new AdmZip();
        let cursor: string | undefined;
        let writtenRows = 0;
        let partNumber = 1;

        do {
            const rowsInPart = Math.min(maxRowsPerFile, Math.max(totalRows - writtenRows, 0));
            const part = await this.generateXlsxPart(criteria, order, accessScope, cursor, rowsInPart);

            zip.addFile(
                `TransactionReport-${request.id}-Part${partNumber}.xlsx`,
                part.bytes,
            );

            TransactionReportGenerator.LOGGER.log(
                `Generated transaction report requestId=${request.id} part=${partNumber} rows=${part.rowCount}`,
            );

            writtenRows += part.rowCount;
            cursor = part.nextCursor;
            partNumber++;
        } while (writtenRows < totalRows && cursor != null);

        return new ReportFile(zip.toBuffer(), 'zip', 'application/zip');
    }

    private async generateCsvPart(
        criteria: Parameters<TransactionRepository['findForReport']>[0],
        order: Parameters<TransactionRepository['findForReport']>[1],
        accessScope: Parameters<TransactionRepository['findForReport']>[4],
        cursor: string | undefined,
        rowCount: number,
    ): Promise<{content: string; rowCount: number; nextCursor?: string}> {
        const result = await this.readRows(criteria, order, accessScope, cursor, rowCount);
        const lines = [TransactionReportGenerator.csvRow(
            TransactionReportGenerator.COLUMNS.map((column) => column.header),
        )];

        for (const row of result.rows) {
            lines.push(TransactionReportGenerator.csvRow(
                TransactionReportGenerator.COLUMNS.map((column) => TransactionReportGenerator.reportCellValue(
                    row,
                    column,
                )),
            ));
        }

        return {
            content: `${lines.join('\n')}\n`,
            rowCount: result.rows.length,
            nextCursor: result.nextCursor,
        };
    }

    private async generateXlsxPart(
        criteria: Parameters<TransactionRepository['findForReport']>[0],
        order: Parameters<TransactionRepository['findForReport']>[1],
        accessScope: Parameters<TransactionRepository['findForReport']>[4],
        cursor: string | undefined,
        rowCount: number,
    ): Promise<{bytes: Buffer; rowCount: number; nextCursor?: string}> {
        const result = await this.readRows(criteria, order, accessScope, cursor, rowCount);
        const sheetRows = [
            TransactionReportGenerator.xlsxRow(
                1,
                TransactionReportGenerator.COLUMNS.map((column) => column.header),
            ),
        ];
        let sheetRowNumber = 2;

        for (const row of result.rows) {
            sheetRows.push(TransactionReportGenerator.xlsxRow(
                sheetRowNumber,
                TransactionReportGenerator.COLUMNS.map((column) => TransactionReportGenerator.reportCellValue(
                    row,
                    column,
                )),
            ));
            sheetRowNumber++;
        }

        const zip = new AdmZip();

        zip.addFile('[Content_Types].xml', Buffer.from(TransactionReportGenerator.xlsxContentTypes(), 'utf8'));
        zip.addFile('_rels/.rels', Buffer.from(TransactionReportGenerator.xlsxRootRels(), 'utf8'));
        zip.addFile('xl/workbook.xml', Buffer.from(TransactionReportGenerator.xlsxWorkbook(), 'utf8'));
        zip.addFile('xl/_rels/workbook.xml.rels', Buffer.from(TransactionReportGenerator.xlsxWorkbookRels(), 'utf8'));
        zip.addFile('xl/styles.xml', Buffer.from(TransactionReportGenerator.xlsxStyles(), 'utf8'));
        zip.addFile('xl/worksheets/sheet1.xml', Buffer.from(TransactionReportGenerator.xlsxSheet(sheetRows), 'utf8'));

        return {
            bytes: zip.toBuffer(),
            rowCount: result.rows.length,
            nextCursor: result.nextCursor,
        };
    }

    private async readRows(
        criteria: Parameters<TransactionRepository['findForReport']>[0],
        order: Parameters<TransactionRepository['findForReport']>[1],
        accessScope: Parameters<TransactionRepository['findForReport']>[4],
        initialCursor: string | undefined,
        rowCount: number,
    ): Promise<{rows: Record<string, unknown>[]; nextCursor?: string}> {
        const rows: Record<string, unknown>[] = [];
        let cursor = initialCursor;

        while (rows.length < rowCount) {
            const limit = Math.min(this.settings.pageSize, rowCount - rows.length);
            const page = await this.transactionRepository.findForReport(criteria, order, cursor, limit, accessScope);

            rows.push(...page.records);
            cursor = page.nextCursor;

            if (page.records.length === 0 || cursor == null) {
                break;
            }
        }

        return {rows, nextCursor: cursor};
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

    private maxDownloadRows(fileType: ReportFileType): number {
        return Math.min(
            this.maxRowsPerGeneratedFile(fileType) * this.settings.maxZipFiles,
            ReportDownloadSettings.MAX_DOWNLOAD_ROWS,
        );
    }

    private static reportFileType(fileType: string): ReportFileType {
        return fileType.trim().toLowerCase() === 'csv' ? 'csv' : 'xlsx';
    }

    private static reportCellValue(row: Record<string, unknown>, column: ReportColumn): unknown {
        if (column.key === 'patchError') {
            return TransactionReportGenerator.patchCallErrorValue(row);
        }

        const value = row[column.key];

        if (value == null && TransactionReportGenerator.NULL_TEXT_COLUMN_KEYS.has(column.key)) {
            return '-';
        }

        return value;
    }

    private static patchCallErrorValue(row: Record<string, unknown>): unknown {
        const value = row.patchError;

        if (TransactionReportGenerator.isTrueValue(row.dispute)) {
            return value;
        }

        return TransactionReportGenerator.withoutPatchResponseBody(value);
    }

    private static withoutPatchResponseBody(value: unknown): unknown {
        if (value == null) {
            return value;
        }

        if (typeof value !== 'string') {
            return TransactionReportGenerator.omitResponseBody(value);
        }

        const trimmed = value.trim();

        if (!trimmed.startsWith('{')) {
            return value;
        }

        try {
            const sanitized = TransactionReportGenerator.omitResponseBody(JSON.parse(trimmed));

            return sanitized == null ? null : JSON.stringify(sanitized);
        } catch {
            return value;
        }
    }

    private static omitResponseBody(value: unknown): unknown {
        if (value == null || typeof value !== 'object' || Array.isArray(value)) {
            return value;
        }

        const {responseBody: _responseBody, ...rest} = value as Record<string, unknown>;

        return Object.keys(rest).length === 0 ? null : rest;
    }

    private static isTrueValue(value: unknown): boolean {
        return value === true || value === 'true' || value === 1 || value === '1';
    }

    private static csvRow(values: readonly unknown[]): string {
        return values.map((value) => TransactionReportGenerator.csvValue(value)).join(',');
    }

    private static csvValue(value: unknown): string {
        if (value == null) {
            return '';
        }

        const normalized = TransactionReportGenerator.safeTextValue(value);
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

        return `<c r="${reference}" t="inlineStr"><is><t>${TransactionReportGenerator.xmlValue(
            TransactionReportGenerator.safeTextValue(value),
        )}</t></is></c>`;
    }

    private static safeTextValue(value: unknown): string {
        let normalized: string;

        if (value instanceof Date) {
            normalized = value.toISOString();
        } else if (typeof value === 'string') {
            normalized = value;
        } else if (typeof value === 'number' || typeof value === 'boolean') {
            normalized = String(value);
        } else {
            normalized = JSON.stringify(value);
        }

        if (normalized === '-') {
            return normalized;
        }

        return /^[=+\-@]/.test(normalized) ? `'${normalized}` : normalized;
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
