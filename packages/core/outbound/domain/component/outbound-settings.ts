// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import { AxiosClientBuilderParams } from '@shared/axios/component';
import { FspiopAccessTokenProvider, FspiopAxiosParams, FspiopSettings } from '@shared/fspiop';
import { SuspiciousTransactionMatchField } from './suspicious-transaction-monitor';

export class OutboundSettings {
    constructor(
        public readonly redisUrl: string,
        public readonly redisCacheItemTimeoutMs: number,
        public readonly fspiopSettings: FspiopSettings,
        public readonly fspiopAxiosParams: FspiopAxiosParams,
        public readonly prefixOracleEndpoint: string,
        public readonly prefixOracleAxiosParams: AxiosClientBuilderParams,
        public readonly prefixOracleCacheTtlMs: number,
        public readonly centralRegistryOracleEndpoint: string | undefined,
        public readonly centralRegistryOracleAxiosParams: AxiosClientBuilderParams,
        public readonly amountDecimalPlaces: number,
        public readonly strictAmountType: boolean,
        public readonly checkPayerFeeAsMandatory: boolean,
        public readonly postSendmoneyPayeeFspIdRequired: boolean,
        /** Master switch for suspicious-pattern monitoring. */
        public readonly suspiciousTxnMonitoringEnabled: boolean,
        /** Monitoring window in minutes (Redis TTL). 0 disables the check. */
        public readonly suspiciousTxnWindowMinutes: number,
        /** Allowed matching attempts in the window. 0 disables the check. */
        public readonly suspiciousTxnThreshold: number,
        /** Ordered fields used to build the Redis pattern key. */
        public readonly suspiciousTxnMatchingFields: readonly SuspiciousTransactionMatchField[],
        /**
         * Credentials for the Hub's bearer token. Absent when the Hub is reached without its API
         * gateway — directly on the internal service addresses — where no token is checked.
         */
        public readonly hubAccessToken?: FspiopAccessTokenProvider.Settings,
    ) {
    }

    /** Redis TTL for the suspicious-pattern counter. */
    get suspiciousTxnWindowMs(): number {
        return this.suspiciousTxnWindowMinutes * 60_000;
    }
}
