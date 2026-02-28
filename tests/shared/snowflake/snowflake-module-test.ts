import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Test } from '@nestjs/testing';
import { Snowflake } from '../../../packages/shared/snowflake/component';
import { SnowflakeModule } from '../../../packages/shared/snowflake/snowflake.module';

describe('SnowflakeModule', () => {

    it('should compile module', async () => {
        const testingModule = await Test.createTestingModule({
            imports: [SnowflakeModule],
        }).compile();

        assert.ok(testingModule);
    });

    it('should provide singleton snowflake instance', async () => {
        const testingModule = await Test.createTestingModule({
            imports: [SnowflakeModule],
        }).compile();

        const provided = testingModule.get(Snowflake);

        assert.ok(provided);
        assert.equal(provided, Snowflake.get());
    });
});
