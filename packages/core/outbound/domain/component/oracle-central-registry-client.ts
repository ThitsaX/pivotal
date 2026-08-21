// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import { Logger } from '@nestjs/common';
import { AxiosInstance } from 'axios';
import { AxiosClientBuilder, AxiosClientBuilderParams } from '@shared/axios/component';
import { FspiopErrors, FspiopException } from '@shared/fspiop';
import { RegisterMsisdnRequest } from '../dto';

export type OracleCentralRegistryAxiosParams = AxiosClientBuilderParams;

export interface OracleCentralRegistryResult {
    httpStatus: number;
    body: unknown;
}

export class OracleCentralRegistryClient {

    private static readonly REGISTER_MSISDN_PATH = '/iips/v1/registry/msisdn';

    private readonly logger = new Logger(OracleCentralRegistryClient.name);
    private readonly endpoint: string | undefined;
    private readonly client: AxiosInstance;

    constructor(
        endpoint: string | undefined,
        params: OracleCentralRegistryAxiosParams = {},
    ) {
        this.endpoint = endpoint == null || endpoint.trim().length === 0
            ? undefined
            : endpoint.endsWith('/')
                ? endpoint.slice(0, -1)
                : endpoint;

        this.client = AxiosClientBuilder.newBuilder()
            .withParams(params)
            .build();
    }

    async registerMsisdn(
        source: string,
        request: RegisterMsisdnRequest,
    ): Promise<OracleCentralRegistryResult> {
        const endpoint = this.endpoint;

        if (endpoint == null) {
            this.logger.error(
                'CENTRAL_REGISTRY_ORACLE_ENDPOINT is not configured; the Central Registry endpoint is disabled.',
            );

            throw new FspiopException(
                FspiopErrors.NOT_IMPLEMENTED,
                'Central Registry integration is not configured on this deployment.',
            );
        }

        try {
            const response = await this.client.post<unknown>(
                `${endpoint}${OracleCentralRegistryClient.REGISTER_MSISDN_PATH}`,
                request,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'X-FSP-Source': source,
                    },
                    validateStatus: () => true,
                },
            );

            return {
                httpStatus: response.status,
                body: response.data,
            };
        } catch (error) {
            const cause = error instanceof Error
                ? error
                : new Error(String(error));

            this.logger.error(
                'Oracle Central Registry request failed without an HTTP response.',
                cause.message,
            );

            throw new FspiopException(
                FspiopErrors.COMMUNICATION_ERROR,
                cause,
            );
        }
    }
}
