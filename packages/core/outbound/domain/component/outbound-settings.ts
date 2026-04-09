export class OutboundSettings {
    constructor(
        public readonly redisUrl: string,
        public readonly redisCacheItemTimeoutMs: number,
    ) {
    }
}
