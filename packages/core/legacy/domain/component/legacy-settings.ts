export class LegacySettings {
    constructor(
        public readonly redisUrl: string,
        public readonly redisTtlMs: number,
    ) {
    }
}
