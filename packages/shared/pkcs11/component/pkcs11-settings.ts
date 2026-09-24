// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.

/**
 * How this workload reaches its PKCS#11 device.
 *
 * The credential is deliberately absent. It comes from Vault at runtime, because a credential in
 * configuration sits in the Deployment manifest, appears in `kubectl describe`, needs a redeploy to
 * rotate, and leaves no record of who read it.
 */
export class Pkcs11Settings {

    /**
     * Sized to concurrency, not to tenant count.
     *
     * A PKCS#11 session carries **one operation at a time** — a second `C_SignInit` before the
     * first `C_Sign` returns fails with `CKR_OPERATION_ACTIVE`. So the pool is what allows
     * concurrent signing at all, and a pool of one serialises every tenant behind every other.
     *
     * Eight covers the concurrency a single replica sees at the agreed throughput with room over.
     * Raising it past {@link threadPoolSize} buys nothing: the calls run on libuv's thread pool,
     * and that is the narrower limit.
     */
    static readonly DEFAULT_POOL_SIZE = 8;

    constructor(
        /**
         * Absolute path to the vendor's PKCS#11 shared object — the CloudHSM client library, or
         * SoftHSM where a development cluster stands in for one.
         *
         * It is a C library built against glibc, so a musl-based image cannot load it: the failure
         * is a relocation error naming a missing symbol rather than anything that says "wrong libc".
         */
        public readonly modulePath: string,

        /**
         * Label of the token to use.
         *
         * CloudHSM presents exactly one token per cluster, so this is a SoftHSM concern in
         * practice — there a token is created per tenant, and the label is how a workload finds
         * the one it was given.
         */
        public readonly tokenLabel: string,

        /** Vault path holding this workload's crypto-user credential, as `{username, password}`. */
        public readonly credentialPath: string,

        /** Path prefix; a tenant's key reference is read from `<prefix>/<fspId>`. */
        public readonly keyRefPathPrefix: string = 'pivotal/keyref',

        public readonly poolSize: number = Pkcs11Settings.DEFAULT_POOL_SIZE,
    ) {
    }

    isConfigured(): boolean {
        return this.modulePath.trim().length > 0 && this.credentialPath.trim().length > 0;
    }

    /**
     * libuv's thread pool size, which bounds how many device calls can be in flight.
     *
     * Not a setting of ours — it is read from `UV_THREADPOOL_SIZE`, which Node samples once at
     * startup and cannot be changed afterwards. Surfaced here because it is the real ceiling on
     * signing throughput and is otherwise invisible: measured against SoftHSM, raising it from the
     * default of 4 to 16 nearly doubled the signatures per second with the pool size unchanged.
     */
    static threadPoolSize(): number {
        const configured = Number(process.env.UV_THREADPOOL_SIZE);

        return Number.isFinite(configured) && configured > 0 ? configured : 4;
    }
}
