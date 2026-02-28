import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Test } from '@nestjs/testing';
import { InterledgerModule, IlpPacket } from '../../../packages/shared/interledger/interledger.module';

describe('InterledgerModule', () => {

    it('should compile module', async () => {
        const testingModule = await Test.createTestingModule({
            imports: [InterledgerModule],
        }).compile();

        assert.ok(testingModule);
    });

    it('should export ilp-packet utility from module file', () => {
        assert.equal(typeof IlpPacket.serializeIlpPrepare, 'function');
        assert.equal(typeof IlpPacket.deserializeIlpPrepare, 'function');
    });
});
