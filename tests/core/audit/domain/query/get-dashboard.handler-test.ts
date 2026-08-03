import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {GetDashboardHandler} from '../../../../../packages/core/audit/domain/query/get-dashboard.handler';
import {GetDashboardQuery} from '../../../../../packages/core/audit/domain/query/get-dashboard.query';

describe('GetDashboardHandler', () => {

    it('aggregates the selected range using the requested portal timezone', async () => {
        const calls: Array<{from: Date; to: Date}> = [];
        const repository = {
            async getErrorStageBreakdown(_scope: string | undefined, from: Date, to: Date) {
                calls.push({from, to});
                return [{stage: 'Parties', count: 1}];
            },
            async getValueByCurrency() {
                return [{currency: 'USD', useCase: 'PERSON_TO_PERSON', totalAmount: '40', txnCount: 4}];
            },
            async getTopFsps(_scope: string | undefined, leg: string) {
                return [{fspId: leg, count: 5, amounts: [{currency: 'USD', totalAmount: '40'}]}];
            },
            async getTimeBuckets() {
                return [
                    {
                        bucketHour: '2026-08-01T17:00:00.000Z',
                        count: 2,
                        errorCount: 1,
                        disputeCount: 1,
                        sumLatencyMs: 100,
                        latencyCount: 1,
                    },
                    {
                        bucketHour: '2026-08-02T16:00:00.000Z',
                        count: 3,
                        errorCount: 0,
                        disputeCount: 0,
                        sumLatencyMs: 900,
                        latencyCount: 3,
                    },
                ];
            },
            async getLastUpdatedAt() {
                return new Date('2026-08-02T16:05:00.000Z');
            },
        };
        const handler = new GetDashboardHandler(repository as never);
        const range = new GetDashboardQuery.DateRange(
            new Date('2026-08-01T17:00:00.000Z'),
            new Date('2026-08-02T17:00:00.000Z'),
        );

        const output = await handler.execute(new GetDashboardQuery(
            new GetDashboardQuery.Input(undefined, range, 'Asia/Bangkok'),
        ));

        assert.deepEqual(output.range, {
            from: '2026-08-01T17:00:00.000Z',
            to: '2026-08-02T17:00:00.000Z',
            timeZone: 'Asia/Bangkok',
        });
        assert.equal(output.total, 5);
        assert.equal(output.errors, 1);
        assert.equal(output.disputes, 1);
        assert.equal(output.successRate, 0.8);
        assert.equal(output.avgLatencyMs, 250);
        assert.deepEqual(output.dailyTrend, [
            {date: '2026-08-02', count: 5, errorCount: 1, disputeCount: 1},
        ]);
        assert.deepEqual(output.hourlyProfile[0], {hour: 0, count: 2, errorCount: 1});
        assert.deepEqual(output.hourlyProfile[23], {hour: 23, count: 3, errorCount: 0});
        assert.deepEqual(output.latencyTrend, [{date: '2026-08-02', avgLatencyMs: 250}]);
        assert.deepEqual(output.valueByCurrency, [
            {currency: 'USD', useCase: 'PERSON_TO_PERSON', totalAmount: '40', txnCount: 4},
        ]);
        assert.ok(calls.every((call) =>
            call.from.toISOString() === range.from.toISOString()
            && call.to.toISOString() === range.to.toISOString()));
    });
});
