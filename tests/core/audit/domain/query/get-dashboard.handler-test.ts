import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {GetDashboardHandler} from '../../../../../packages/core/audit/domain/query/get-dashboard.handler';
import {GetDashboardQuery} from '../../../../../packages/core/audit/domain/query/get-dashboard.query';

describe('GetDashboardHandler', () => {

    it('aggregates the selected range using the requested portal timezone', async () => {
        const calls: Array<{from: Date; to: Date}> = [];
        let bucketTimeZone: string | undefined;
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
            async getTimeBuckets(_scope: string | undefined, _from: Date, _to: Date, timeZone: string) {
                bucketTimeZone = timeZone;
                return [
                    {
                        bucketHour: '2026-08-01T17:30:00.000Z',
                        count: 2,
                        errorCount: 1,
                        disputeCount: 1,
                        sumLatencyMs: 100,
                        latencyCount: 1,
                    },
                    {
                        bucketHour: '2026-08-02T17:00:00.000Z',
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
            new Date('2026-08-01T17:30:00.000Z'),
            new Date('2026-08-02T17:30:00.000Z'),
        );

        const output = await handler.execute(new GetDashboardQuery(
            new GetDashboardQuery.Input(undefined, range, 'Asia/Yangon'),
        ));

        assert.deepEqual(output.range, {
            from: '2026-08-01T17:30:00.000Z',
            to: '2026-08-02T17:30:00.000Z',
            timeZone: 'Asia/Yangon',
        });
        assert.equal(output.total, 5);
        assert.equal(bucketTimeZone, 'Asia/Yangon');
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

    it('forwards payerFsp and payeeFsp filters to every rollup read', async () => {
        const filterCalls: Array<{
            method: string;
            payerFsp: string | undefined;
            payeeFsp: string | undefined;
        }> = [];

        const repository = {
            async getErrorStageBreakdown(
                _scope: string | undefined,
                _from: Date,
                _to: Date,
                payerFsp?: string,
                payeeFsp?: string,
            ) {
                filterCalls.push({method: 'getErrorStageBreakdown', payerFsp, payeeFsp});
                return [];
            },
            async getValueByCurrency(
                _scope: string | undefined,
                _from: Date,
                _to: Date,
                payerFsp?: string,
                payeeFsp?: string,
            ) {
                filterCalls.push({method: 'getValueByCurrency', payerFsp, payeeFsp});
                return [];
            },
            async getTopFsps(
                _scope: string | undefined,
                leg: string,
                _from: Date,
                _to: Date,
                _limit: number,
                payerFsp?: string,
                payeeFsp?: string,
            ) {
                filterCalls.push({method: `getTopFsps:${leg}`, payerFsp, payeeFsp});
                return [];
            },
            async getTimeBuckets(
                _scope: string | undefined,
                _from: Date,
                _to: Date,
                _timeZone: string,
                payerFsp?: string,
                payeeFsp?: string,
            ) {
                filterCalls.push({method: 'getTimeBuckets', payerFsp, payeeFsp});
                return [];
            },
            async getLastUpdatedAt() {
                return null;
            },
        };

        const handler = new GetDashboardHandler(repository as never);
        const range = new GetDashboardQuery.DateRange(
            new Date('2026-08-01T00:00:00.000Z'),
            new Date('2026-08-02T00:00:00.000Z'),
        );

        await handler.execute(new GetDashboardQuery(
            new GetDashboardQuery.Input(undefined, range, 'UTC', 'DemoDFSP1', 'DemoDFSP2'),
        ));

        assert.equal(filterCalls.length, 5);
        for (const call of filterCalls) {
            assert.equal(call.payerFsp, 'DemoDFSP1', call.method);
            assert.equal(call.payeeFsp, 'DemoDFSP2', call.method);
        }
    });
});
