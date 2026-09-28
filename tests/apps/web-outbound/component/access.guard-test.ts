import * as assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {describe, it} from 'node:test';
import {ExecutionContext} from '@nestjs/common';
import {
    AccessGuard,
    IS_SIGNED_TRANSFER_STATUS_KEY,
} from '../../../../packages/apps/web-outbound/component';
import {FspiopErrors, FspiopException} from '../../../../packages/shared/fspiop';
import {Jwt} from '../../../../packages/shared/security/component/jwt';
import {RsaKeyPair} from '../../../../packages/shared/security/component/key';

const SOURCE = 'wallet1';
const URI = '/secured/transferStatus/01ARZ3NDEKTSV4RRFFQ69G5FAV';

interface RequestShape {
    method: string;
    originalUrl: string;
    url: string;
    headers: Record<string, string | undefined>;
    body?: unknown;
}

function executionContext(request: RequestShape): ExecutionContext {
    return {
        getHandler: () => function handler(): void {},
        getClass: () => class Controller {},
        switchToHttp: () => ({
            getRequest: () => request,
        }),
    } as unknown as ExecutionContext;
}

function assertCode(code: string): (error: unknown) => boolean {
    return (error: unknown): boolean => error instanceof FspiopException
        && error.errorDefinition.errorType.code === code;
}

describe('AccessGuard signed transfer status lookup', () => {
    const keyPair = RsaKeyPair.generate();

    function createGuard(): {
        guard: AccessGuard;
        reservations: Set<string>;
        reservationCalls: Array<{key: string; ttlMs: number}>;
    } {
        const reservations = new Set<string>();
        const reservationCalls: Array<{key: string; ttlMs: number}> = [];
        const guard = new AccessGuard(
            {
                load() {
                    return this;
                },
                get(fspId: string) {
                    return fspId === SOURCE ? keyPair.publicKey : undefined;
                },
            },
            {enabled: false},
            {
                getAllAndOverride(key: string): boolean {
                    return key === IS_SIGNED_TRANSFER_STATUS_KEY;
                },
            } as never,
            {
                async reserve(key: string, ttlMs: number): Promise<boolean> {
                    reservationCalls.push({key, ttlMs});
                    if (reservations.has(key)) {
                        return false;
                    }

                    reservations.add(key);
                    return true;
                },
            } as never,
        );

        return {guard, reservations, reservationCalls};
    }

    function signedRequest(options: {
        requestUri?: string;
        signedUri?: string;
        requestMethod?: string;
        signedMethod?: string;
        requestDate?: string;
        signedDate?: string;
        nonce?: string;
        payload?: Record<string, unknown>;
        source?: string;
    } = {}): RequestShape {
        const requestDate = options.requestDate ?? new Date().toUTCString();
        const requestUri = options.requestUri ?? URI;
        const requestMethod = options.requestMethod ?? 'GET';
        const token = Jwt.sign(
            keyPair.privateKey,
            {
                uri: options.signedUri ?? requestUri,
                method: options.signedMethod ?? requestMethod,
                date: options.signedDate ?? requestDate,
                nonce: options.nonce ?? randomUUID(),
            },
            options.payload ?? {},
        );

        return {
            method: requestMethod,
            originalUrl: requestUri,
            url: requestUri,
            headers: {
                'fspiop-source': options.source ?? SOURCE,
                date: requestDate,
                authorization: token.full,
            },
        };
    }

    it('enforces signed lookup authentication even when general JWT access is disabled', async () => {
        const {guard, reservationCalls} = createGuard();

        assert.equal(await guard.canActivate(executionContext(signedRequest())), true);
        assert.equal(reservationCalls.length, 1);
        assert.match(reservationCalls[0].key, /^nonce:wallet1:/);
        assert.equal(reservationCalls[0].ttlMs, 10 * 60 * 1000);
    });

    it('rejects a verbatim replay of an otherwise valid request', async () => {
        const {guard} = createGuard();
        const request = signedRequest({nonce: 'replay-once'});

        await guard.canActivate(executionContext(request));
        await assert.rejects(
            () => guard.canActivate(executionContext(request)),
            assertCode(FspiopErrors.INVALID_SIGNATURE.errorType.code),
        );
    });

    it('rejects stale and future dates outside the five-minute window', async () => {
        for (const offset of [-301_000, 301_000]) {
            const {guard} = createGuard();
            const date = new Date(Date.now() + offset).toUTCString();

            await assert.rejects(
                () => guard.canActivate(executionContext(signedRequest({requestDate: date}))),
                assertCode(FspiopErrors.INVALID_SIGNATURE.errorType.code),
            );
        }
    });

    it('binds the signature to the exact URI, method, and date header', async () => {
        const cases = [
            signedRequest({signedUri: `${URI}X`}),
            signedRequest({signedMethod: 'POST'}),
            signedRequest({signedDate: new Date(Date.now() - 1_000).toUTCString()}),
        ];

        for (const request of cases) {
            const {guard} = createGuard();
            await assert.rejects(
                () => guard.canActivate(executionContext(request)),
                assertCode(FspiopErrors.INVALID_SIGNATURE.errorType.code),
            );
        }
    });

    it('requires an empty object payload', async () => {
        const {guard} = createGuard();

        await assert.rejects(
            () => guard.canActivate(executionContext(signedRequest({payload: {date: 'legacy'}}))),
            assertCode(FspiopErrors.INVALID_SIGNATURE.errorType.code),
        );
    });

    it('rejects non-RS256 and unsigned tokens', async () => {
        const date = new Date().toUTCString();
        const unsigned = `${Jwt.encode(JSON.stringify({
            alg: 'none',
            typ: 'JWT',
            uri: URI,
            method: 'GET',
            date,
            nonce: randomUUID(),
        }))}.e30.`;
        const request = signedRequest({requestDate: date});
        request.headers.authorization = unsigned;
        const {guard} = createGuard();

        await assert.rejects(
            () => guard.canActivate(executionContext(request)),
            assertCode(FspiopErrors.INVALID_SIGNATURE.errorType.code),
        );
    });

    it('distinguishes missing and malformed authorization headers', async () => {
        const missing = signedRequest();
        delete missing.headers.authorization;
        const malformed = signedRequest();
        malformed.headers.authorization = 'not-a-compact-jws';

        await assert.rejects(
            () => createGuard().guard.canActivate(executionContext(missing)),
            assertCode(FspiopErrors.MISSING_MANDATORY_ELEMENT.errorType.code),
        );
        await assert.rejects(
            () => createGuard().guard.canActivate(executionContext(malformed)),
            assertCode(FspiopErrors.MALFORMED_SYNTAX.errorType.code),
        );
    });

    it('rejects a missing date and an unregistered source', async () => {
        const missingDate = signedRequest();
        delete missingDate.headers.date;

        await assert.rejects(
            () => createGuard().guard.canActivate(executionContext(missingDate)),
            assertCode(FspiopErrors.MISSING_MANDATORY_ELEMENT.errorType.code),
        );
        await assert.rejects(
            () => createGuard().guard.canActivate(executionContext(signedRequest({source: 'wallet3'}))),
            assertCode(FspiopErrors.INVALID_SIGNATURE.errorType.code),
        );
    });
});
