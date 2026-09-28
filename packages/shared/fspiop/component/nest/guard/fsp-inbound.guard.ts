// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {CanActivate, ExecutionContext, Injectable, Logger} from '@nestjs/common';
import {Request} from 'express';
import {PublicKeyStore} from '@shared/security/component/key';
import {FspiopVerifyMode} from '../../fspiop-verify-mode';
import {JwsPolicyStore} from '../../security/jws-policy-store';
import {FspiopErrors} from '../../../exception/fspiop-errors';
import {FspiopException} from '../../../exception/fspiop-exception';
import {FspiopHeaders} from '../../fspiop-headers';
import {FspiopSettings} from '../../fspiop-settings';
import {FspiopSignature} from '../../fspiop-signature';

/**
 * NestJS Guard that verifies the FSPIOP JWS signature on incoming HTTP requests.
 *
 * When FspiopSettings.useJws is false the guard is a no-op and passes every
 * request through unchanged — use this to disable verification in dev/test.
 *
 * Verification steps (mirror of FspiopSigningInterceptor):
 *   1. Read fspiop-source header → look up the sender's public key
 *   2. Parse fspiop-signature header → { protectedHeader, signature }
 *   3. Reconstruct the signed body from the request body (or date header for GET)
 *   4. Call FspiopSignature.verify()
 *   5. Cross-check the protected header's claims against the actual request
 *
 * Error codes thrown:
 *   3102 MISSING_MANDATORY_ELEMENT — required header / field absent
 *   3101 MALFORMED_SYNTAX          — fspiop-signature is not valid JSON
 *   3105 INVALID_SIGNATURE         — no trusted key for source FSP, or verification failed
 *
 * Usage — per controller:
 *   @UseGuards(FspInboundGuard)
 *   @Controller('parties')
 *   export class PartiesController {}
 *
 * Usage — globally:
 *   app.useGlobalGuards(app.get(FspInboundGuard));
 */
@Injectable()
export class FspInboundGuard implements CanActivate {

    private readonly logger = new Logger(FspInboundGuard.name);

    /**
     * Count of requests accepted **unsigned** under `verify-if-present`, keyed by source.
     *
     * This is the signal that says when a peer is ready for `require`: a source whose count has
     * stopped rising has switched signing on. Without it, advancing a peer is guesswork.
     */
    private readonly unsignedAccepted = new Map<string, number>();

    constructor(
        private readonly publicKeyStore: PublicKeyStore,
        private readonly settings: FspiopSettings,
        private readonly policyStore: JwsPolicyStore,
    ) {}

    /** Snapshot of the unsigned-but-accepted counters, for metrics or an admin endpoint. */
    unsignedAcceptedCounts(): ReadonlyMap<string, number> {
        return new Map(this.unsignedAccepted);
    }

    canActivate(context: ExecutionContext): boolean {
        if (!this.settings.useJws) {
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

        // ── 2. Resolve this source's verification mode ────────────────────────
        const mode = this.policyStore.verifyMode(source);

        if (mode === FspiopVerifyMode.Off) {
            return true;
        }

        const rawSignature = request.headers[FspiopHeaders.Names.FSPIOP_SIGNATURE];
        const body = FspInboundGuard.resolveBody(request);

        // A detached JWS signs the body, so a request without one cannot carry a signature —
        // `GET /parties/{type}/{id}` above all. No implementation signs these: the reference
        // refuses to, and so do we. Demanding a signature here would make `require` unsatisfiable
        // for the whole of the parties lookup, and therefore unusable.
        //
        // A signature that is *present* on a bodyless request is still rejected below: it cannot
        // have been produced over anything the receiver can reconstruct.
        if (rawSignature == null && body == null) {
            return true;
        }

        // Under verify-if-present an unsigned request is accepted and counted. This is what keeps
        // the Hub reachable — it runs FSPIOP_USE_JWS=false and sends its errors unsigned — and
        // what absorbs peers who sign everything except PUT /parties.
        if (!rawSignature && mode === FspiopVerifyMode.VerifyIfPresent) {
            this.countUnsignedAccepted(source);
            return true;
        }

        if (!rawSignature) {
            throw new FspiopException(
                FspiopErrors.MISSING_MANDATORY_ELEMENT,
                'Missing mandatory header: fspiop-signature.',
            );
        }

        // ── 3. Look up the sender's public key ────────────────────────────────
        // Reached only when a signature is present, so an unkeyed source that sends nothing still
        // passes under verify-if-present. A signature we cannot check is never waved through.
        const publicKey = this.publicKeyStore.get(source);
        if (!publicKey) {
            throw new FspiopException(
                FspiopErrors.INVALID_SIGNATURE,
                `No trusted public key registered for fspiop-source: '${source}'.`,
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

        // ── 4. Verify the signature over the received body ────────────────────
        if (body == null) {
            throw new FspiopException(
                FspiopErrors.INVALID_SIGNATURE,
                'A bodyless request cannot carry a verifiable JWS signature.',
            );
        }

        if (!FspiopSignature.verify(publicKey, sigHeader, body)) {
            throw new FspiopException(
                FspiopErrors.INVALID_SIGNATURE,
                'JWS signature verification failed.',
            );
        }

        // ── 5. Cross-check the protected header against the actual request ────
        FspInboundGuard.assertHeaderMatchesRequest(sigHeader, request, source);

        return true;
    }

    private countUnsignedAccepted(source: string): void {

        const next = (this.unsignedAccepted.get(source) ?? 0) + 1;
        this.unsignedAccepted.set(source, next);

        // Log the transitions, not every request: the first one is news, the rest are noise.
        if (next === 1) {
            this.logger.warn(
                `Accepting unsigned FSPIOP requests from '${source}' under verify-if-present. `
                + 'This source is not ready for require.',
            );
        }
    }

    /**
     * A valid signature only proves the protected header was not altered — not that it describes
     * *this* request. Without these checks a signature validly produced for one endpoint can be
     * replayed against another, which is the entire reason the metadata is in the header.
     *
     * The URI is compared against the `fspiop-uri` header the sender is required to send, rather
     * than being re-derived here: the sender's base path is not knowable from the received request,
     * and the reference validator compares the same way.
     */
    private static assertHeaderMatchesRequest(
        sigHeader: FspiopSignature.Header,
        request: Request,
        source: string,
    ): void {

        let fields: Record<string, string>;

        try {
            fields = FspiopSignature.decodeProtectedHeader(sigHeader.protectedHeader);
        } catch {
            throw new FspiopException(
                FspiopErrors.MALFORMED_SYNTAX,
                'Header fspiop-signature carries a protectedHeader that is not valid JSON.',
            );
        }

        if (fields['FSPIOP-Source'] !== source) {
            throw new FspiopException(
                FspiopErrors.INVALID_SIGNATURE,
                'Signed FSPIOP-Source does not match the fspiop-source header.',
            );
        }

        const method = request.method?.toUpperCase();

        if (fields['FSPIOP-HTTP-Method'] !== method) {
            throw new FspiopException(
                FspiopErrors.INVALID_SIGNATURE,
                'Signed FSPIOP-HTTP-Method does not match the request method.',
            );
        }

        const uri = request.headers[FspiopHeaders.Names.FSPIOP_URI];

        if (uri == null) {
            throw new FspiopException(
                FspiopErrors.MISSING_MANDATORY_ELEMENT,
                'Missing mandatory header: fspiop-uri.',
            );
        }

        if (fields['FSPIOP-URI'] !== String(uri)) {
            throw new FspiopException(
                FspiopErrors.INVALID_SIGNATURE,
                'Signed FSPIOP-URI does not match the fspiop-uri header.',
            );
        }

        const destination = request.headers[FspiopHeaders.Names.FSPIOP_DESTINATION];

        if (destination != null && fields['FSPIOP-Destination'] !== String(destination)) {
            throw new FspiopException(
                FspiopErrors.INVALID_SIGNATURE,
                'Signed FSPIOP-Destination does not match the fspiop-destination header.',
            );
        }
    }

    /**
     * Mirrors FspiopSigningInterceptor.resolveBody(): the signed payload is the request body.
     *
     * Bodyless requests are never signed by either side — see the note in the interceptor — so a
     * signature on one cannot verify and the request is rejected rather than silently accepted.
     */
    private static resolveBody(request: Request): string | undefined {
        if (request.body == null || Object.keys(request.body as object).length === 0) {
            return undefined;
        }

        return JSON.stringify(request.body);
    }
}
