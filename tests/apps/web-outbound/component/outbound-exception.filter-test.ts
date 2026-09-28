// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import * as assert from 'node:assert/strict';
import {after, beforeEach, describe, it} from 'node:test';
import {ArgumentsHost, Logger} from '@nestjs/common';
import {OutboundExceptionFilter}
    from '../../../../packages/apps/web-outbound/component/outbound-exception.filter';
import {createOutboundValidationException}
    from '../../../../packages/apps/web-outbound/component/outbound-validation-error';
import {formatSendMoneyRequestLog}
    from '../../../../packages/apps/web-outbound/component/send-money-log';
import {FspiopErrors, FspiopException} from '../../../../packages/shared/fspiop';

const ORIGINAL_LOGGER_ERROR = Logger.prototype.error;

after(() => {
    Logger.prototype.error = ORIGINAL_LOGGER_ERROR;
});

interface CapturedResponse {
    status: number | null;
    body:   {
        statusCode?: string;
        message?: string;
        localeMessage?: string;
        detailedDescription?: string;
    } | null;
}

interface FakeResponse {
    status: (code: number) => FakeResponse;
    json:   (payload: NonNullable<CapturedResponse['body']>) => FakeResponse;
}

const SEND_MONEY_BODY = {
    homeTransactionId: 'home-1',
    from: {idType: 'MSISDN', idValue: '95333312345', fspId: 'wallet1', firstName: 'Aung', lastName: 'Min'},
    to: {idType: 'MSISDN', idValue: '96555512345', fspId: 'wallet2'},
    amountType: 'SEND',
    amount: '12',
    currency: 'USD',
    transactionType: 'TRANSFER',
    subScenario: 'PERSON_TO_PERSON',
};

function makeHost(
    captured: CapturedResponse,
    request: Record<string, unknown> = {method: 'POST', path: '/secured/sendmoney', body: SEND_MONEY_BODY},
): ArgumentsHost {
    const response: FakeResponse = {
        status(code: number): FakeResponse {
            captured.status = code;
            return response;
        },
        json(payload: NonNullable<CapturedResponse['body']>): FakeResponse {
            captured.body = payload;
            return response;
        },
    };

    return {
        switchToHttp: () => ({
            getResponse: <T>(): T => response as unknown as T,
            getRequest: <T>(): T => request as unknown as T,
        }),
    } as unknown as ArgumentsHost;
}

/** Collects the ERROR lines the filter writes, so we can assert on the audit log. */
function captureErrorLogs(): string[] {
    const lines: string[] = [];

    Logger.prototype.error = function (message: unknown): void {
        lines.push(String(message));
    } as never;

    return lines;
}

function sendMoneyErrorLines(lines: string[]): string[] {
    return lines.filter((line) => line.startsWith('Post Send Money error response'));
}

describe('OutboundExceptionFilter - Post Send Money error logging', () => {

    let logged: string[];

    beforeEach(() => {
        logged = captureErrorLogs();
    });

    // Every row below is an error response a Post Send Money call can return. Only the
    // first reached the log before this fix; the rest fell through the diagnostics gate.
    const cases: ReadonlyArray<{name: string; code: string; exception: () => unknown}> = [
        {
            name: 'ValidationPipe rejection',
            code: '3102',
            exception: () => createOutboundValidationException([
                {property: 'amount', constraints: {isFspiopAmount: 'amount must be a valid FSPIOP Amount'}},
            ] as never),
        },
        {
            name: 'controller precondition',
            code: '3102',
            exception: () => new FspiopException(
                FspiopErrors.MISSING_MANDATORY_ELEMENT,
                'fspiop-source header or request.from.fspId is required.',
            ),
        },
        {
            name: 'payer permission rejection',
            code: '4300',
            exception: () => new FspiopException(FspiopErrors.PAYER_PERMISSION_ERROR, 'not authorized'),
        },
        {
            name: 'downstream FSP rejection',
            code: '3201',
            exception: () => new FspiopException(FspiopErrors.DESTINATION_FSP_ERROR, 'peer rejected'),
        },
        {
            name: 'unexpected failure',
            code: '2001',
            exception: () => new Error('boom'),
        },
    ];

    for (const {name, code, exception} of cases) {
        it(`logs the error response for a ${name} (${code})`, () => {
            const captured: CapturedResponse = {status: null, body: null};

            new OutboundExceptionFilter().catch(exception(), makeHost(captured));

            const lines = sendMoneyErrorLines(logged);

            assert.equal(lines.length, 1, `expected exactly one audit line, got ${lines.length}`);
            assert.match(lines[0]!, new RegExp(`errorCode=${code}\\b`));
            assert.match(lines[0]!, /to\.idValue 96555512345 and from\.idValue 95333312345/);
            assert.equal(captured.body?.statusCode, code);
        });
    }

    it('emits the audit line as a single line', () => {
        new OutboundExceptionFilter().catch(
            new FspiopException(FspiopErrors.DESTINATION_FSP_ERROR, 'peer rejected'),
            makeHost({status: null, body: null}),
        );

        assert.equal(sendMoneyErrorLines(logged)[0]!.includes('\n'), false);
    });

    it('does not emit a Send Money line for other routes', () => {
        new OutboundExceptionFilter().catch(
            new FspiopException(FspiopErrors.MISSING_MANDATORY_ELEMENT, 'acceptParty or acceptQuote is required.'),
            makeHost({status: null, body: null}, {
                method: 'PUT',
                path: '/secured/sendmoney/01HX',
                body: {acceptParty: true},
            }),
        );

        assert.deepEqual(sendMoneyErrorLines(logged), []);
    });

    it('returns the payer fee validation error in the normal outbound response shape', () => {
        const captured: CapturedResponse = {status: null, body: null};
        const description =
            'Fee validation failed. Required fee information was not provided by the Payer DFSP.';

        new OutboundExceptionFilter().catch(
            new FspiopException(FspiopErrors.MISSING_EXTENSION_PARAMETER, description),
            makeHost(captured, {
                method: 'PUT',
                path: '/secured/sendmoney/01HX',
                body: {acceptParty: true},
            }),
        );

        assert.equal(captured.status, 417);
        assert.equal(captured.body?.statusCode, '3107');
        assert.equal(captured.body?.message, 'Please fill out the complete and correct information.');
        assert.equal(captured.body?.localeMessage, 'Please fill out the complete and correct information.');
        assert.equal(captured.body?.detailedDescription, description);
    });

    it('still logs when the body never parsed into party identifiers', () => {
        new OutboundExceptionFilter().catch(
            new FspiopException(FspiopErrors.MALFORMED_SYNTAX, 'bad payload'),
            makeHost({status: null, body: null}, {
                method: 'POST',
                path: '/secured/sendmoney',
                body: undefined,
            }),
        );

        const lines = sendMoneyErrorLines(logged);

        assert.equal(lines.length, 1);
        assert.match(lines[0]!, /to\.idValue unknown and from\.idValue unknown/);
    });
});

describe('Post Send Money request log', () => {

    it('pairs with the error line on the same identifiers, in the ticket order', () => {
        assert.match(
            formatSendMoneyRequestLog(SEND_MONEY_BODY),
            /^Post Send Money request for to\.idValue 96555512345 and from\.idValue 95333312345: \{/,
        );
    });

    it('redacts credentials and masks personal data', () => {
        // Extra fields the DTO does not declare still reach req.body untouched, because
        // ValidationPipe's whitelist strips the DTO copy, not the parsed request body.
        const line = formatSendMoneyRequestLog({
            ...SEND_MONEY_BODY,
            pin: '1234',
            accessToken: 'eyJhbGciOi',
        });

        assert.equal(line.includes('"1234"'), false);
        assert.equal(line.includes('eyJhbGciOi'), false);
        assert.equal(line.includes('Aung'), false);
        assert.equal(line.includes('Min'), false);
        // Party identifiers stay: they are the correlation keys the ticket requires.
        assert.match(line, /95333312345/);
    });

    it('escapes newlines so a hostile payload cannot forge a log line', () => {
        const line = formatSendMoneyRequestLog({
            ...SEND_MONEY_BODY,
            note: 'line one\nline two',
        });

        assert.equal(line.includes('\n'), false);
    });
});
