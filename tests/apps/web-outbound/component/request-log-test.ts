import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {Request, Response} from 'express';
import {MdcContext} from '../../../../packages/shared/foundation';
import {
    formatRequestBodyLog,
    formatRequestHeadersLog,
    RequestLogMiddleware,
} from '../../../../packages/apps/web-outbound/component';

interface CapturedLog {
    line: string;
    idValue?: string;
    transferId?: string;
}

function captureMiddlewareLogs(middleware: RequestLogMiddleware): CapturedLog[] {
    const lines: CapturedLog[] = [];
    const logger = (middleware as unknown as {logger: {log: (line: string) => void}}).logger;

    logger.log = (line: string): void => {
        lines.push({
            line,
            idValue: MdcContext.get(MdcContext.ID_VALUE),
            transferId: MdcContext.get(MdcContext.TRANSFER_ID),
        });
    };

    return lines;
}

describe('Request log', () => {

    it('includes the request method, URL, and non-sensitive headers', () => {
        const line = formatRequestHeadersLog('GET', '/secured/rates?baseCurrency=USD', {
            'fspiop-source': 'wallet1',
            date: 'Wed, 04 Nov 2026 10:00:00 GMT',
        });

        assert.match(line, /^Request headers: /);
        assert.match(line, /"method":"GET"/);
        assert.match(line, /"url":"\/secured\/rates\?baseCurrency=USD"/);
        assert.match(line, /"fspiop-source":"wallet1"/);
    });

    it('shows whether Bearer was supplied without logging credentials', () => {
        const bearer = formatRequestHeadersLog('GET', '/secured/rates', {
            authorization: 'bearer secret-token',
            cookie: 'session-secret',
            'x-api-key': 'api-secret',
            'x-access-token': 'access-secret',
        });
        const raw = formatRequestHeadersLog('GET', '/secured/rates', {
            authorization: 'raw-secret-token',
        });

        assert.match(bearer, /"authorization":"Bearer \[redacted\]"/);
        assert.match(raw, /"authorization":"\[redacted\]"/);
        assert.match(bearer, /"cookie":"\[redacted\]"/);
        assert.match(bearer, /"x-api-key":"\[redacted\]"/);
        assert.match(bearer, /"x-access-token":"\[redacted\]"/);
        assert.equal(bearer.includes('secret-token'), false);
        assert.equal(bearer.includes('session-secret'), false);
        assert.equal(bearer.includes('api-secret'), false);
        assert.equal(bearer.includes('access-secret'), false);
        assert.equal(raw.includes('raw-secret-token'), false);
    });

    it('uses route-specific request body formats', () => {
        assert.match(
            formatRequestBodyLog('POST', '/secured/sendmoney', {
                from: {idValue: 'payer-1'},
                to: {idValue: 'payee-1'},
            })!,
            /^Post Send Money request for to\.idValue payee-1 and from\.idValue payer-1:/,
        );
        assert.match(
            formatRequestBodyLog('PUT', '/secured/sendmoney/transfer-1', {acceptParty: true})!,
            /^Put SendMoney Accept Party Request for TransferId transfer-1 :/,
        );
        assert.match(
            formatRequestBodyLog('PUT', '/secured/sendmoney/transfer-1', {acceptQuote: true})!,
            /^Put SendMoney Accept Quote Request for TransferId transfer-1 :/,
        );
        assert.match(
            formatRequestBodyLog('POST', '/secured/registry/msisdn', {msisdn: '123'})!,
            /^Register MSISDN Request :/,
        );
    });

    it('does not mask personal fields but still redacts credentials', () => {
        const line = formatRequestBodyLog('POST', '/secured/sendmoney', {
            from: {idValue: 'payer-1', displayName: 'Payer Name', firstName: 'Payer'},
            to: {idValue: 'payee-1', lastName: 'Payee'},
            pin: '1234',
        })!;

        assert.match(line, /Payer Name/);
        assert.match(line, /"firstName":"Payer"/);
        assert.match(line, /"lastName":"Payee"/);
        assert.match(line, /"pin":"\[redacted\]"/);
        assert.equal(line.includes('1234'), false);
    });

    it('renders header and body logs as single lines', () => {
        const headers = formatRequestHeadersLog('POST', '/secured/sendmoney', {
            'x-test': 'line one\nline two',
        });
        const body = formatRequestBodyLog('POST', '/secured/sendmoney', {
            note: 'line one\nline two',
        })!;

        assert.equal(headers.includes('\n'), false);
        assert.equal(body.includes('\n'), false);
    });

    it('logs POST sendmoney headers and body with the payer idValue context', () => {
        const middleware = new RequestLogMiddleware();
        const lines = captureMiddlewareLogs(middleware);
        let nextIdValue: string | undefined;

        middleware.use({
            method: 'POST',
            path: '/secured/sendmoney',
            originalUrl: '/secured/sendmoney',
            headers: {'fspiop-source': 'wallet1'},
            body: {
                from: {idValue: 'payer-1'},
                to: {idValue: 'payee-1'},
            },
        } as unknown as Request, {} as Response, () => {
            nextIdValue = MdcContext.get(MdcContext.ID_VALUE);
        });

        assert.equal(lines.length, 2);
        assert.match(lines[0]!.line, /^Request headers:/);
        assert.match(lines[1]!.line, /^Post Send Money request/);
        assert.deepEqual(lines.map(({idValue}) => idValue), ['payer-1', 'payer-1']);
        assert.equal(nextIdValue, 'payer-1');
    });

    it('logs PUT sendmoney headers and body with the transferId context', () => {
        const middleware = new RequestLogMiddleware();
        const lines = captureMiddlewareLogs(middleware);

        middleware.use({
            method: 'PUT',
            path: '/secured/sendmoney/transfer-1',
            originalUrl: '/secured/sendmoney/transfer-1',
            headers: {'fspiop-source': 'wallet1'},
            body: {acceptParty: true, amount: '12'},
        } as unknown as Request, {} as Response, () => {});

        assert.equal(lines.length, 2);
        assert.match(lines[1]!.line, /^Put SendMoney Accept Party Request/);
        assert.deepEqual(lines.map(({transferId}) => transferId), ['transfer-1', 'transfer-1']);
    });

    it('logs only headers for a bodyless request', () => {
        const middleware = new RequestLogMiddleware();
        const lines = captureMiddlewareLogs(middleware);

        middleware.use({
            method: 'GET',
            path: '/secured/rates',
            originalUrl: '/secured/rates?baseCurrency=USD&quoteCurrency=LRD',
            headers: {},
        } as unknown as Request, {} as Response, () => {});

        assert.equal(lines.length, 1);
        assert.match(lines[0]!.line, /^Request headers:/);
    });
});
