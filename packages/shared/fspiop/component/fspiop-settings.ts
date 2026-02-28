import {Injectable} from '@nestjs/common';

/**
 * FSPIOP runtime settings resolved from environment variables.
 *
 * | Property       | Env variable              | Default |
 * |----------------|---------------------------|---------|
 * | switchBaseUrl  | FSPIOP_SWITCH_BASE_URL    | ''      |
 * | switchId       | FSPIOP_SWITCH_ID          | ''      |
 * | signJws        | FSPIOP_SIGN_JWS           | false   |
 * | verifyJws      | FSPIOP_VERIFY_JWS         | false   |
 * | mutualTls      | FSPIOP_MUTUAL_TLS         | false   |
 */
@Injectable()
export class FspiopSettings {

    readonly switchBaseUrl: string;
    readonly switchId: string;
    readonly signJws: boolean;
    readonly verifyJws: boolean;
    readonly mutualTls: boolean;

    constructor() {
        this.switchBaseUrl = process.env[FspiopSettings.ENV_SWITCH_BASE_URL] ?? '';
        this.switchId = process.env[FspiopSettings.ENV_SWITCH_ID] ?? '';
        this.signJws = process.env[FspiopSettings.ENV_SIGN_JWS] === 'true';
        this.verifyJws = process.env[FspiopSettings.ENV_VERIFY_JWS] === 'true';
        this.mutualTls = process.env[FspiopSettings.ENV_MUTUAL_TLS] === 'true';
    }

    private static readonly ENV_SWITCH_BASE_URL = 'FSPIOP_SWITCH_BASE_URL';
    private static readonly ENV_SWITCH_ID = 'FSPIOP_SWITCH_ID';
    private static readonly ENV_SIGN_JWS = 'FSPIOP_SIGN_JWS';
    private static readonly ENV_VERIFY_JWS = 'FSPIOP_VERIFY_JWS';
    private static readonly ENV_MUTUAL_TLS = 'FSPIOP_MUTUAL_TLS';
}
