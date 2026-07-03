// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import { Logger } from '@nestjs/common';
import { AxiosInstance, isAxiosError } from 'axios';
import { AxiosClientBuilder, AxiosClientBuilderParams } from '@shared/axios/component';
import { FspiopErrors, FspiopException } from '@shared/fspiop';
import { Dfsp } from '../dto';
import { RedisClient } from './redis-client';

export type PrefixOracleAxiosParams = AxiosClientBuilderParams;

export class PrefixOracleClient {

    private static readonly CACHE_KEY_ALL = 'dfsp:prefixes:all';
    private static readonly CACHE_KEY_USECASE_PREFIX = 'dfsp:prefixes:usecase:';

    private readonly logger = new Logger(PrefixOracleClient.name);
    private readonly prefixOracleEndpoint: string;
    private readonly client: AxiosInstance;

    constructor(
        prefixOracleEndpoint: string,
        params: PrefixOracleAxiosParams,
        private readonly redisClient: RedisClient,
        private readonly cacheTtlMs: number,
    ) {
        this.prefixOracleEndpoint = prefixOracleEndpoint.endsWith('/')
            ? prefixOracleEndpoint.slice(0, -1)
            : prefixOracleEndpoint;

        this.client = AxiosClientBuilder.newBuilder()
            .withParams(params)
            .withHttpLogger(true)
            .build();
    }

    async getDfspListByUsecase(usecase: string): Promise<Dfsp[]> {
        const cacheKey = `${PrefixOracleClient.CACHE_KEY_USECASE_PREFIX}${usecase.trim()}`;

        const cached = await this.readCache(cacheKey);
        if (cached !== undefined) {
            this.logger.log(`DFSP list served from cache (key=${cacheKey}, count=${cached.length}).`);

            return cached;
        }

        this.logger.log(`DFSP list cache miss (key=${cacheKey}); fetching from oracle.`);

        try {
            const response = await this.client.get<Dfsp[]>(
                `${this.prefixOracleEndpoint}/prefixesByUseCase/${encodeURIComponent(usecase)}`,
            );

            this.logger.log(`DFSP list fetched from oracle (key=${cacheKey}, count=${response.data.length}).`);

            await this.writeCache(cacheKey, response.data);

            return response.data;
        } catch (error) {
            const status = isAxiosError(error) ? error.response?.status : undefined;
            const message = error instanceof Error ? error.message : String(error);

            this.logger.error(`getDfspListByUsecase failed for usecase=${usecase}`, message);

            if (status === 404) {
                throw new FspiopException(
                    FspiopErrors.GENERIC_ID_NOT_FOUND,
                    `DFSP list not found for usecase: ${usecase}`,
                );
            }

            throw new FspiopException(
                FspiopErrors.COMMUNICATION_ERROR,
                message,
            );
        }
    }

    async getDfspList(): Promise<Dfsp[]> {
        const cacheKey = PrefixOracleClient.CACHE_KEY_ALL;

        const cached = await this.readCache(cacheKey);
        if (cached !== undefined) {
            this.logger.log(`DFSP list served from cache (key=${cacheKey}, count=${cached.length}).`);

            return cached;
        }

        this.logger.log(`DFSP list cache miss (key=${cacheKey}); fetching from oracle.`);

        try {
            const response = await this.client.get<Dfsp[]>(
                `${this.prefixOracleEndpoint}/prefixes`,
            );

            this.logger.log(`DFSP list fetched from oracle (key=${cacheKey}, count=${response.data.length}).`);

            await this.writeCache(cacheKey, response.data);

            return response.data;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);

            this.logger.error('getDfspList failed', message);

            throw new FspiopException(
                FspiopErrors.COMMUNICATION_ERROR,
                message,
            );
        }
    }

    private async readCache(cacheKey: string): Promise<Dfsp[] | undefined> {
        try {
            return await this.redisClient.get<Dfsp[]>(cacheKey);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.warn(`Cache read failed for key=${cacheKey}: ${message}`);

            return undefined;
        }
    }

    private async writeCache(cacheKey: string, value: Dfsp[]): Promise<void> {
        try {
            await this.redisClient.set(cacheKey, value, this.cacheTtlMs);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.warn(`Cache write failed for key=${cacheKey}: ${message}`);
        }
    }
}
