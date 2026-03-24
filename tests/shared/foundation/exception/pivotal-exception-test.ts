import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {PivotalException} from '../../../../packages/shared/foundation/exception';

describe('PivotalException', () => {

    it('should retain code and message', () => {
        const exception = new PivotalException('PIVOTAL_ERROR', 'Something went wrong');

        assert.equal(exception.code, 'PIVOTAL_ERROR');
        assert.equal(exception.description, 'Something went wrong');
        assert.equal(exception.message, 'Something went wrong');
        assert.equal(exception.name, 'PivotalException');
    });

    it('should normalize unknown errors to internal server error', () => {
        const exception = PivotalException.normalize(new Error('boom'));

        assert.equal(exception.code, 'INTERNAL_SERVER_ERROR');
        assert.equal(exception.message, 'boom');
    });
});
