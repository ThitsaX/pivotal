import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
    ArgumentsHost,
    BadRequestException,
    ConflictException,
    ForbiddenException,
    HttpStatus,
    NotFoundException,
    UnauthorizedException,
} from '@nestjs/common';
import {PivotalExceptionFilter}
    from '../../../../../../packages/shared/foundation/component/nest/filter/pivotal-exception.filter';
import {PivotalException} from '../../../../../../packages/shared/foundation/exception';

interface CapturedResponse {
    status: number | null;
    body:   {code: string; message: string} | null;
}

interface FakeResponse {
    status: (code: number) => FakeResponse;
    json:   (payload: {code: string; message: string}) => FakeResponse;
}

function makeHost(captured: CapturedResponse): ArgumentsHost {
    const response: FakeResponse = {
        status(code: number): FakeResponse {
            captured.status = code;
            return response;
        },
        json(payload: {code: string; message: string}): FakeResponse {
            captured.body = payload;
            return response;
        },
    };

    return {
        switchToHttp(): {getResponse: <T>() => T} {
            return {
                getResponse<T>(): T {
                    return response as unknown as T;
                },
            };
        },
    } as unknown as ArgumentsHost;
}

function freshCapture(): CapturedResponse {
    return {status: null, body: null};
}

describe('PivotalExceptionFilter', () => {

    it('passes UnauthorizedException through as 401 with its structured {code, message} body', () => {

        const captured = freshCapture();
        const filter = new PivotalExceptionFilter();

        filter.catch(
            new UnauthorizedException({code: 'AUTH_INVALID_TOKEN', message: 'Invalid or expired access token.'}),
            makeHost(captured),
        );

        assert.equal(captured.status, HttpStatus.UNAUTHORIZED);
        assert.deepEqual(captured.body, {code: 'AUTH_INVALID_TOKEN', message: 'Invalid or expired access token.'});
    });

    it('passes NotFoundException through as 404 with its structured body', () => {

        const captured = freshCapture();
        new PivotalExceptionFilter().catch(
            new NotFoundException({code: 'ADMIN_USER_NOT_FOUND', message: 'User not found.'}),
            makeHost(captured),
        );

        assert.equal(captured.status, HttpStatus.NOT_FOUND);
        assert.deepEqual(captured.body, {code: 'ADMIN_USER_NOT_FOUND', message: 'User not found.'});
    });

    it('passes ConflictException through as 409 with its structured body', () => {

        const captured = freshCapture();
        new PivotalExceptionFilter().catch(
            new ConflictException({code: 'ADMIN_USER_LAST_ADMIN', message: 'Cannot deactivate the last admin.'}),
            makeHost(captured),
        );

        assert.equal(captured.status, HttpStatus.CONFLICT);
        assert.deepEqual(captured.body, {code: 'ADMIN_USER_LAST_ADMIN', message: 'Cannot deactivate the last admin.'});
    });

    it('passes ForbiddenException through as 403 with its structured body', () => {

        const captured = freshCapture();
        new PivotalExceptionFilter().catch(
            new ForbiddenException({code: 'AUTH_PERMISSION_DENIED', message: 'No.'}),
            makeHost(captured),
        );

        assert.equal(captured.status, HttpStatus.FORBIDDEN);
        assert.deepEqual(captured.body, {code: 'AUTH_PERMISSION_DENIED', message: 'No.'});
    });

    it('derives a fallback code from the HTTP status when the body is a plain string', () => {

        const captured = freshCapture();
        new PivotalExceptionFilter().catch(
            new BadRequestException('email must be an email'),
            makeHost(captured),
        );

        assert.equal(captured.status, HttpStatus.BAD_REQUEST);
        assert.deepEqual(captured.body, {code: 'BAD_REQUEST', message: 'email must be an email'});
    });

    it('derives a fallback code when the body has only a message field', () => {

        const captured = freshCapture();
        new PivotalExceptionFilter().catch(
            new BadRequestException({message: 'plain object, no code'}),
            makeHost(captured),
        );

        assert.equal(captured.status, HttpStatus.BAD_REQUEST);
        assert.deepEqual(captured.body, {code: 'BAD_REQUEST', message: 'plain object, no code'});
    });

    it('routes PivotalException through the existing PivotalStatusTranslator path', () => {

        const captured = freshCapture();
        new PivotalExceptionFilter().catch(
            new PivotalException('PARTICIPANT_CONFLICT', 'Already exists.'),
            makeHost(captured),
        );

        assert.equal(captured.status, HttpStatus.CONFLICT);
        assert.deepEqual(captured.body, {code: 'PARTICIPANT_CONFLICT', message: 'Already exists.'});
    });

    it('falls back to 500 INTERNAL_SERVER_ERROR for unknown thrown values', () => {

        const captured = freshCapture();
        new PivotalExceptionFilter().catch(new Error('boom'), makeHost(captured));

        assert.equal(captured.status, HttpStatus.INTERNAL_SERVER_ERROR);
        assert.deepEqual(captured.body, {code: 'INTERNAL_SERVER_ERROR', message: 'boom'});
    });
});
