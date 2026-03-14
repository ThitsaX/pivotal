import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {FspiopErrors, FspiopException} from '../../../../packages/shared/fspiop/exception';

describe('FspiopException', () => {

    it('should fallback to definition description when explicit message is blank', () => {
        const exception = new FspiopException(FspiopErrors.COMMUNICATION_ERROR, '   ');
        const errorObject = exception.toErrorObject();

        assert.equal(exception.message, FspiopErrors.COMMUNICATION_ERROR.description);
        assert.equal(errorObject.errorInformation.errorDescription, FspiopErrors.COMMUNICATION_ERROR.description);
    });

    it('should normalize unknown error with non-empty fallback description', () => {
        const exception = FspiopException.normalize(new Error(''));
        const errorObject = exception.toErrorObject();

        assert.equal(exception.message, FspiopErrors.INTERNAL_SERVER_ERROR.description);
        assert.equal(errorObject.errorInformation.errorDescription, FspiopErrors.INTERNAL_SERVER_ERROR.description);
    });
});
