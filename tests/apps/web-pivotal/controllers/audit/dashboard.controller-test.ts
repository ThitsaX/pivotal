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
        assert.equal(dispatched.input.payerFsp, undefined);
        assert.equal(dispatched.input.payeeFsp, undefined);
    });

    it('passes optional payerFsp and payeeFsp filters to the query handler', async () => {
        const dispatchedQueries: GetDashboardQuery[] = [];
        const queryBus = {
            async execute(query: GetDashboardQuery): Promise<never> {
                dispatchedQueries.push(query);
                return {} as never;
            },
        };
        const controller = new DashboardAuditController(queryBus as never, {} as never);

        await controller.getDashboard(
            undefined,
            '2026-08-01T00:00:00.000Z',
            '2026-08-02T00:00:00.000Z',
            'UTC',
            'DemoDFSP1',
            'DemoDFSP2',
        );

        const dispatched = dispatchedQueries[0];
        assert.equal(dispatched.input.accessScope, undefined);
        assert.equal(dispatched.input.payerFsp, 'DemoDFSP1');
        assert.equal(dispatched.input.payeeFsp, 'DemoDFSP2');
    });

    it('treats blank payerFsp and payeeFsp as Any (undefined)', async () => {
        const dispatchedQueries: GetDashboardQuery[] = [];
        const queryBus = {
            async execute(query: GetDashboardQuery): Promise<never> {
                dispatchedQueries.push(query);
                return {} as never;
            },
        };
        const controller = new DashboardAuditController(queryBus as never, {} as never);

        await controller.getDashboard(
            undefined,
            '2026-08-01T00:00:00.000Z',
            '2026-08-02T00:00:00.000Z',
            'UTC',
            '   ',
            '',
        );

        const dispatched = dispatchedQueries[0];
        assert.equal(dispatched.input.payerFsp, undefined);
        assert.equal(dispatched.input.payeeFsp, undefined);
    });

    it('rejects incomplete, reversed, overlong and invalid-timezone ranges', async () => {
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
                '2026-01-01T00:00:00Z',
                '2026-06-01T00:00:00Z',
                'UTC',
            ),
            /Custom range cannot exceed 4 months/,
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

    it('accepts a range of at most 4 months', async () => {
        const dispatchedQueries: GetDashboardQuery[] = [];
        const queryBus = {
            async execute(query: GetDashboardQuery): Promise<never> {
                dispatchedQueries.push(query);
                return {} as never;
            },
        };
        const controller = new DashboardAuditController(queryBus as never, {} as never);

        await controller.getDashboard(
            undefined,
            '2026-01-01T00:00:00.000Z',
            '2026-05-01T00:00:00.000Z',
            'UTC',
        );

        assert.equal(dispatchedQueries.length, 1);
        assert.equal(dispatchedQueries[0].input.range?.from.toISOString(), '2026-01-01T00:00:00.000Z');
        assert.equal(dispatchedQueries[0].input.range?.to.toISOString(), '2026-05-01T00:00:00.000Z');
    });

    it('clamps month overflow so 31 May + 4 months is 30 Sep, not 1 Oct', async () => {
        const queryBus = {
            async execute(): Promise<never> {
                return {} as never;
            },
        };
        const controller = new DashboardAuditController(queryBus as never, {} as never);

        // 31 May 17:30Z is 1 Jun 00:00 Asia/Rangoon; +4 months clamped → 30 Sep 17:30Z
        // (1 Oct 00:00 Rangoon). 2 Oct 00:00 Rangoon (1 Oct 17:30Z) must reject.
        await assert.rejects(
            () => controller.getDashboard(
                undefined,
                '2026-05-31T17:30:00.000Z',
                '2026-10-01T17:30:00.000Z',
                'Asia/Rangoon',
            ),
            /Custom range cannot exceed 4 months/,
        );

        await controller.getDashboard(
            undefined,
            '2026-05-31T17:30:00.000Z',
            '2026-09-30T17:30:00.000Z',
            'Asia/Rangoon',
        );
    });
});
