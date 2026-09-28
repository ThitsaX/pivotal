import 'reflect-metadata';
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { DfspListController } from '../../../../packages/apps/web-outbound/controllers/dfsp-list.controller';
import { Dfsp, GetDfspListByUsecaseQuery, GetDfspListQuery } from '../../../../packages/core/outbound/domain';

const dfspList: Dfsp[] = [
    {
        id: 2,
        prefix: 101,
        fspId: 'wallet2',
        createdAt: '2025-06-10T12:52:37.000Z',
        status: 'active',
        localeName: 'Demo wallet2',
        dfspType: 'wallet',
        additionalInfo: '{"employees": 10000, "country": "USD" }',
        logoDataType: '',
        logoBase64: '',
        name: 'Demo Wallet 2',
    },
];

function makeController(result: Dfsp[] = dfspList): {
    controller: DfspListController;
    executedQueries: unknown[];
} {
    const executedQueries: unknown[] = [];

    const controller = new DfspListController({
        async execute(query: unknown): Promise<Dfsp[]> {
            executedQueries.push(query);
            return result;
        },
    } as never);

    return { controller, executedQueries };
}

function assertGetRoute(method: Function, path: string): void {
    assert.equal(Reflect.getMetadata(PATH_METADATA, method), path);
    assert.equal(Reflect.getMetadata(METHOD_METADATA, method), RequestMethod.GET);
}

describe('DfspListController', () => {

    it('registers the DFSP list with count route', () => {
        assertGetRoute(
            DfspListController.prototype.getDfspListWithCount,
            'dfsps-with-prefixes-and-count',
        );
    });

    it('registers the DFSP list with count by use case route', () => {
        assertGetRoute(
            DfspListController.prototype.getDfspListWithCountByUsecase,
            'dfsps-with-prefixes-and-count/:usecase',
        );
    });

    it('returns DFSP list wrapped with total count', async () => {
        const { controller, executedQueries } = makeController();

        const output = await controller.getDfspListWithCount();

        assert.deepEqual(output, {
            totalNumberOfDfsp: 1,
            dfspList,
        });
        assert.equal(executedQueries.length, 1);
        assert.ok(executedQueries[0] instanceof GetDfspListQuery);
    });

    it('returns use case DFSP list wrapped with total count', async () => {
        const { controller, executedQueries } = makeController();

        const output = await controller.getDfspListWithCountByUsecase('PERSON_TO_PERSON');

        assert.deepEqual(output, {
            totalNumberOfDfsp: 1,
            dfspList,
        });
        assert.equal(executedQueries.length, 1);
        assert.ok(executedQueries[0] instanceof GetDfspListByUsecaseQuery);
        assert.equal((executedQueries[0] as GetDfspListByUsecaseQuery).usecase, 'PERSON_TO_PERSON');
    });
});
