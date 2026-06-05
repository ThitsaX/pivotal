import {FspiopAxiosParams, FspiopSettings} from "@shared/fspiop";

export class OutboundSettings {
    constructor(
        public readonly redisUrl: string,
        public readonly redisCacheItemTimeoutMs: number,
        public readonly fspiopSettings: FspiopSettings,
        public readonly fspiopAxiosParams: FspiopAxiosParams,
        public readonly amountDecimalPlaces: number
    ) {
    }
}
