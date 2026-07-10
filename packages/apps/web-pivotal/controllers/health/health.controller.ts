// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Controller, Get, Inject, ServiceUnavailableException} from '@nestjs/common';
import {InjectDataSource} from '@nestjs/typeorm';
import {PIVOTAL_DB_READ_CONNECTION_NAME, Public} from '@core/auth/domain';
import {DataSource} from 'typeorm';

@Controller()
export class HealthController {

    constructor(
        @InjectDataSource(PIVOTAL_DB_READ_CONNECTION_NAME)
        @Inject(PIVOTAL_DB_READ_CONNECTION_NAME)
        private readonly dataSource: DataSource,
    ) {
    }

    @Public()
    @Get('healthz')
    healthz(): {status: string} {
        return {status: 'ok'};
    }

    @Public()
    @Get('readyz')
    async readyz(): Promise<{status: string}> {

        try {
            await this.dataSource.query('SELECT 1');
            return {status: 'ok'};
        } catch (error: unknown) {
            const reason = error instanceof Error ? error.message : 'unknown';
            throw new ServiceUnavailableException({
                code:    'NOT_READY',
                message: `Database not reachable: ${reason}.`,
            });
        }
    }
}
