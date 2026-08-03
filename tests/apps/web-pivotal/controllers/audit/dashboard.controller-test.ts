import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {DashboardAuditController} from '../../../../../packages/apps/web-pivotal/controllers/audit/dashboard.controller';
import {GetDashboardQuery} from '../../../../../packages/core/audit/domain';

describe('DashboardAuditController', () => {

    it('passes a valid range, timezone and DFSP scope to the query handler', async () => {
        const dispatchedQueries: GetDashboardQuery[] = [];
        const queryBus = {
            async execute(query: GetDashboardQuery): Promise<never> {
                dispatchedQueries.push(query);
                return {} as never;
            },
        };
        const controller = new DashboardAuditController(queryBus as never, {} as never);

        await controller.getDashboard(
            {fspId: 'wallet1'} as never,
            '2026-08-01T17:00:00.000Z',
            '2026-08-02T17:00:00.000Z',
            'Asia/Bangkok',
        );

        const dispatched = dispatchedQueries[0];
        assert.equal(dispatched.input.accessScope?.fspId, 'wallet1');
        assert.equal(dispatched.input.range?.from.toISOString(), '2026-08-01T17:00:00.000Z');
        assert.equal(dispatched.input.range?.to.toISOString(), '2026-08-02T17:00:00.000Z');
        assert.equal(dispatched.input.timeZone, 'Asia/Bangkok');
    });

    it('rejects incomplete, reversed and invalid-timezone ranges', async () => {
        const controller = new DashboardAuditController({execute: async () => ({})} as never, {} as never);

        await assert.rejects(
            controller.getDashboard(undefined, '2026-08-01T00:00:00Z', undefined, 'UTC'),
            /from and to must be provided together/,
        );
        await assert.rejects(
            controller.getDashboard(
                undefined,
                '2026-08-02T00:00:00Z',
                '2026-08-01T00:00:00Z',
                'UTC',
            ),
            /from must be before to/,
        );
        await assert.rejects(
            controller.getDashboard(
                undefined,
                '2026-08-01T00:00:00Z',
                '2026-08-02T00:00:00Z',
                'Not\/A_Timezone',
            ),
            /timeZone must be a valid IANA time zone/,
        );
    });
});
