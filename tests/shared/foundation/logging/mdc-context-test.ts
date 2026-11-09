import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {MdcContext} from '../../../../packages/shared/foundation';

describe('MdcContext', () => {

    it('inherits values with run', () => {
        MdcContext.run({[MdcContext.ID_VALUE]: 'payer-1'}, () => {
            MdcContext.run({[MdcContext.TRANSFER_ID]: 'transfer-1'}, () => {
                assert.equal(MdcContext.get(MdcContext.ID_VALUE), 'payer-1');
                assert.equal(MdcContext.get(MdcContext.TRANSFER_ID), 'transfer-1');
            });
        });
    });

    it('replaces inherited values with runIsolated', () => {
        MdcContext.run({[MdcContext.ID_VALUE]: 'payer-1'}, () => {
            MdcContext.runIsolated({[MdcContext.TRANSFER_ID]: 'transfer-1'}, () => {
                assert.equal(MdcContext.get(MdcContext.ID_VALUE), undefined);
                assert.equal(MdcContext.get(MdcContext.TRANSFER_ID), 'transfer-1');
            });
        });
    });
});
