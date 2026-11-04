// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import { InternalAxiosRequestConfig } from 'axios';
import { FspiopAxiosInterceptor } from '../fspiop-axios';
import { FspiopHeaders } from '../../fspiop-headers';
import { FspiopUri } from '../../fspiop-uri';
import { JwsSigner } from '../../jws-signer';

/**
 * Signs outbound FSPIOP requests, producing the `fspiop-signature` header.
 *
 * Also sets the `fspiop-uri` and `fspiop-http-method` HTTP headers. These are not decoration: the
 * receiving validator cross-checks them against the protected header, and rejects at the presence
 * check before the signature is examined. Emitting the signature without them fails at every peer.
 *
 * A request is signed only when the deployment holds a key for its `fspiop-source`. An unkeyed
 * source passes through unsigned rather than throwing, which is what makes per-participant
 * rollout possible — a tenant is enabled by giving it a key, not by a deploy.
 *
 * Signing is delegated to a {@link JwsSigner} rather than done here, because where the signature is
 * produced depends on custody: in this process for a key held as a PEM, inside the device for a key
 * that never leaves one. This interceptor is identical either way.
 */
export class FspiopSigningInterceptor {

    constructor(private readonly jwsSigner: JwsSigner) {}

    build(): FspiopAxiosInterceptor {
        // Asynchronous because a hardware signer is a round trip, not a computation. Axios awaits
        // a request interceptor that returns a promise, so nothing above this has to change.
        return async (config: InternalAxiosRequestConfig) => {

            const source = config.headers?.[FspiopHeaders.Names.FSPIOP_SOURCE];

            if (!source) {
                return config;
            }

            const body = FspiopSigningInterceptor.resolveBody(config);

            // A detached JWS signs the body, so a bodyless request — GET /parties/{type}/{id} and
            // friends — has nothing to sign. The reference implementation does not sign these
            // either: baseRequests._get carries no signing call and jwsSigner.sign throws
            // 'Cannot sign with no body'. Substituting a synthetic payload would produce a
            // signature no peer can reconstruct, which is worse than none because it looks like
            // protection. Verified against @mojaloop/sdk-standard-components.
            if (body == null) {
                return config;
            }

            const uri = FspiopUri.extract(FspiopSigningInterceptor.resolveUrl(config));
            const method = (config.method ?? 'get').toUpperCase();

            const signatureHeader = await this.jwsSigner.sign(
                String(source),
                {
                    method,
                    uri,
                    source: String(source),
                    destination: FspiopSigningInterceptor.readHeader(
                        config,
                        FspiopHeaders.Names.FSPIOP_DESTINATION,
                    ),
                    date: FspiopSigningInterceptor.readHeader(config, FspiopHeaders.Names.DATE),
                },
                body,
            );

            // No key for this source. Unchanged from when the lookup happened above: the request
            // goes out unsigned rather than failing, which is what lets tenants be switched on one
            // at a time.
            if (signatureHeader == null) {
                return config;
            }

            // Set before the signature so a throw above leaves no half-signed request.
            config.headers[FspiopHeaders.Names.FSPIOP_URI] = uri;
            config.headers[FspiopHeaders.Names.FSPIOP_HTTP_METHOD] = method;
            config.headers[FspiopHeaders.Names.FSPIOP_SIGNATURE] = JSON.stringify(signatureHeader);

            return config;
        };
    }

    /** Joins `baseURL` and `url`; `FspiopUri.extract` tolerates either an absolute URL or a path. */
    private static resolveUrl(config: InternalAxiosRequestConfig): string {

        const url = config.url ?? '';

        if (url.length === 0) {
            return config.baseURL ?? '';
        }

        if (config.baseURL == null || url.includes('://')) {
            return url;
        }

        const base = config.baseURL.endsWith('/') ? config.baseURL.slice(0, -1) : config.baseURL;
        const path = url.startsWith('/') ? url : `/${url}`;

        return `${base}${path}`;
    }

    /** @returns the body to sign, or `undefined` when the request carries none. */
    private static resolveBody(config: InternalAxiosRequestConfig): string | undefined {

        if (config.data == null) {
            return undefined;
        }

        return typeof config.data === 'string' ? config.data : JSON.stringify(config.data);
    }

    private static readHeader(
        config: InternalAxiosRequestConfig,
        name: string,
    ): string | undefined {

        const value = config.headers?.[name];

        return value != null && typeof value !== 'object' ? String(value) : undefined;
    }
}
