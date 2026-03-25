import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {FspClientException} from '../../../../../packages/core/connector/domain/exception';

describe('FspClientException', () => {

    it('should retain default code and message', () => {
        const exception = new FspClientException('Something went wrong');

        assert.equal(exception.code, 'FSP_CLIENT_ERROR');
        assert.equal(exception.description, 'Something went wrong');
        assert.equal(exception.message, 'Something went wrong');
        assert.equal(exception.name, 'FspClientException');
    });

    it('should normalize unknown errors to internal server error', () => {
        const exception = FspClientException.normalize(new Error('boom'));

        assert.equal(exception.code, 'INTERNAL_SERVER_ERROR');
        assert.equal(exception.message, 'boom');
    });
});
