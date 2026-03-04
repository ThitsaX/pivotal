import {Injectable} from '@nestjs/common';

/**
 * FSPIOP runtime settings.
 *
 * Plain value holder — the consumer is responsible for constructing it
 * with values from any source (env, config service, database, etc.) and
 * registering it as a NestJS provider.
 *
 * @example — env-based provider in a consumer module
 * {
 *   provide: FspiopSettings,
 *   useFactory: () => new FspiopSettings(
 *     process.env['FSPIOP_SWITCH_BASE_URL'] ?? '',
 *     process.env['FSPIOP_SWITCH_ID']       ?? '',
 *     process.env['FSPIOP_USE_JWS']         === 'true',
 *     process.env['FSPIOP_USE_MUTUAL_TLS']  === 'true',
 *   ),
 * }
 */
@Injectable()
export class FspiopSettings {
    constructor(
        public readonly switchBaseUrl: string,
        public readonly switchId: string,
        public readonly useJws: boolean,
        public readonly useMutualTls: boolean,
    ) {
    }
}
