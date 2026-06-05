import { AxiosClientBuilderParams } from '@shared/axios/component';
import { FspiopAxiosParams, FspiopSettings } from '@shared/fspiop';

export class OutboundSettings {
    constructor(
        public readonly redisUrl: string,
        public readonly redisCacheItemTimeoutMs: number,
        public readonly fspiopSettings: FspiopSettings,
        public readonly fspiopAxiosParams: FspiopAxiosParams,
        public readonly prefixOracleEndpoint: string,
        public readonly prefixOracleAxiosParams: AxiosClientBuilderParams,
        public readonly prefixOracleCacheTtlMs: number,
        public readonly amountDecimalPlaces: number
    ) {
    }
}
