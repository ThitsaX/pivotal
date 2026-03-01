import {Module} from '@nestjs/common';
import {KeyStoreModule} from '@shared/security/component/key';
import {FspiopSettings} from '../fspiop-settings';
import {FspiopJwsGuard} from './guard/fspiop-jws.guard';

/**
 * Import this module in any NestJS feature module whose controllers need
 * FSPIOP JWS signature verification.
 *
 * Provides and exports:
 *   - FspiopJwsGuard  — apply with @UseGuards(FspiopJwsGuard) per controller/route
 *   - FspiopSettings  — reads FSPIOP_VERIFY_JWS and related env vars
 *
 * @example
 * @Module({
 *   imports: [FspiopNestModule],
 *   controllers: [PartiesController],
 * })
 * export class PartiesModule {}
 */
@Module({
    imports: [KeyStoreModule],
    providers: [FspiopSettings, FspiopJwsGuard],
    exports: [FspiopSettings, FspiopJwsGuard],
})
export class FspiopNestModule {}
