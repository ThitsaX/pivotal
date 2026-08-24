import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {LogLevelsResolver} from '../../../../packages/shared/foundation/logging';

describe('LogLevelsResolver', () => {

    it('should resolve supported log levels', () => {
        assert.deepEqual(LogLevelsResolver.resolveLogLevels('verbose'), ['verbose']);
        assert.deepEqual(LogLevelsResolver.resolveLogLevels('debug'), ['debug']);
        assert.deepEqual(LogLevelsResolver.resolveLogLevels('log'), ['log']);
        assert.deepEqual(LogLevelsResolver.resolveLogLevels('warn'), ['warn']);
        assert.deepEqual(LogLevelsResolver.resolveLogLevels('error'), ['error']);
        assert.deepEqual(LogLevelsResolver.resolveLogLevels('fatal'), ['fatal']);
    });

    it('should normalize whitespace and letter case', () => {
        const result = LogLevelsResolver.resolveLogLevels('  DEBUG  ');

        assert.deepEqual(result, ['debug']);
    });

    it('should use log as the default when no value is provided', () => {
        const result = LogLevelsResolver.resolveLogLevels();

        assert.deepEqual(result, ['log']);
    });

    it('should fall back to log for an unsupported value', () => {
        const result = LogLevelsResolver.resolveLogLevels('invalid');

        assert.deepEqual(result, ['log']);
    });
});
