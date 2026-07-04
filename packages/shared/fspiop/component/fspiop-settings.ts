// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
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
 *     process.env['FSPIOP_SWITCH_ID']       ?? '',
 *     process.env['FSPIOP_PARTIES_URL']     ?? '',
 *     process.env['FSPIOP_QUOTES_URL']      ?? '',
 *     process.env['FSPIOP_TRANSFERS_URL']   ?? '',
 *     process.env['FSPIOP_USE_JWS']         === 'true',
 *     process.env['FSPIOP_USE_MUTUAL_TLS']  === 'true',
 *   ),
 * }
 */

export class FspiopSettings {
    constructor(
        public readonly switchId: string,
        public readonly partiesUrl: string,
        public readonly quotesUrl: string,
        public readonly transfersUrl: string,
        public readonly useJws: boolean,
        public readonly useMutualTls: boolean,
    ) {
    }
}
