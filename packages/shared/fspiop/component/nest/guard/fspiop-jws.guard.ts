import {CanActivate, ExecutionContext, Injectable} from '@nestjs/common';
import {Request} from 'express';
import {Jwt} from '@shared/security/component/jwt';
import {PublicKeyStore} from '@shared/security/component/key';
import {FspiopErrors} from '../../../exception/fspiop-errors';
import {FspiopException} from '../../../exception/fspiop-exception';
import {FspiopHeaders} from '../../fspiop-headers';
import {FspiopSettings} from '../../fspiop-settings';
import {FspiopSignature} from '../../fspiop-signature';

/**
 * NestJS Guard that verifies the FSPIOP JWS signature on incoming HTTP requests.
 *
 * When FspiopSettings.verifyJws is false the guard is a no-op and passes every
 * request through unchanged — use this to disable verification in dev/test.
 *
 * Verification steps (mirror of FspiopSigningInterceptor):
 *   1. Read fspiop-source header → look up the sender's public key
 *   2. Parse fspiop-signature header → { protectedHeader, signature }
 *   3. Reconstruct the JWT body from the request body (or date header for GET)
 *   4. Build Jwt.Token and call FspiopSignature.verify()
 *
 * Error codes thrown:
 *   3102 MISSING_MANDATORY_ELEMENT — required header / field absent
 *   3101 MALFORMED_SYNTAX          — fspiop-signature is not valid JSON
 *   3105 INVALID_SIGNATURE         — no trusted key for source FSP, or verification failed
 *
 * Usage — per controller:
 *   @UseGuards(FspiopJwsGuard)
 *   @Controller('parties')
 *   export class PartiesController {}
 *
 * Usage — globally:
 *   app.useGlobalGuards(app.get(FspiopJwsGuard));
 */
@Injectable()
export class FspiopJwsGuard implements CanActivate {

    constructor(
        private readonly publicKeyStore: PublicKeyStore,
        private readonly settings: FspiopSettings,
    ) {}

    canActivate(context: ExecutionContext): boolean {
        if (!this.settings.verifyJws) {
            return true;
        }

        const request = context.switchToHttp().getRequest<Request>();

        // ── 1. Identify the source FSP ────────────────────────────────────────
        const rawSource = request.headers[FspiopHeaders.Names.FSPIOP_SOURCE];
        if (!rawSource) {
            throw new FspiopException(
                FspiopErrors.MISSING_MANDATORY_ELEMENT,
                'Missing mandatory header: fspiop-source.',
            );
        }

        const source = String(rawSource);

        // ── 2. Look up the sender's public key ────────────────────────────────
        const publicKey = this.publicKeyStore.get(source);
        if (!publicKey) {
            throw new FspiopException(
                FspiopErrors.INVALID_SIGNATURE,
                `No trusted public key registered for fspiop-source: '${source}'.`,
            );
        }

        // ── 3. Parse fspiop-signature header ──────────────────────────────────
        const rawSignature = request.headers[FspiopHeaders.Names.FSPIOP_SIGNATURE];
        if (!rawSignature) {
            throw new FspiopException(
                FspiopErrors.MISSING_MANDATORY_ELEMENT,
                'Missing mandatory header: fspiop-signature.',
            );
        }

        let sigHeader: FspiopSignature.Header;
        try {
            sigHeader = JSON.parse(String(rawSignature)) as FspiopSignature.Header;
        } catch {
            throw new FspiopException(
                FspiopErrors.MALFORMED_SYNTAX,
                'Header fspiop-signature must be a valid JSON object.',
            );
        }

        if (!sigHeader.signature || !sigHeader.protectedHeader) {
            throw new FspiopException(
                FspiopErrors.MISSING_MANDATORY_ELEMENT,
                'Header fspiop-signature is missing required fields: "signature" and/or "protectedHeader".',
            );
        }

        // ── 4. Reconstruct the JWT token and verify ───────────────────────────
        const body        = FspiopJwsGuard.resolveBody(request);
        const bodyEncoded = Jwt.encode(body);
        const token       = new Jwt.Token(sigHeader.protectedHeader, bodyEncoded, sigHeader.signature);

        if (!FspiopSignature.verify(publicKey, token)) {
            throw new FspiopException(
                FspiopErrors.INVALID_SIGNATURE,
                'JWS signature verification failed.',
            );
        }

        return true;
    }

    /**
     * Mirrors FspiopSigningInterceptor.resolveBody():
     *   - requests with a body → JSON.stringify(body)
     *   - bodyless requests (GET) → JSON.stringify({ date: <date-header> })
     */
    private static resolveBody(request: Request): string {
        if (request.body != null && Object.keys(request.body as object).length > 0) {
            return JSON.stringify(request.body);
        }

        const date = request.headers[FspiopHeaders.Names.DATE];
        return JSON.stringify({date: date != null ? String(date) : ''});
    }
}
