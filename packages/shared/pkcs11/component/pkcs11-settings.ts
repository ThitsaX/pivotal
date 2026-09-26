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
     * Sized to concurrency, not to tenant count — and **small on purpose**.
     *
     * A PKCS#11 session carries one operation at a time: a second `C_SignInit` before the first
     * `C_Sign` returns fails with `CKR_OPERATION_ACTIVE`. So a pool of one serialises every tenant
     * behind every other, and some pooling is necessary.
     *
     * But more is worse past a handful, which is the opposite of what a pool usually does. The
     * binding offers no asynchronous `C_SignInit`, and against a network-attached device that call
     * is a round trip — so every signature blocks the event loop before its asynchronous half
     * begins, and concurrent workers queue those blocking calls against the one thread. Measured
     * against hardware, throughput peaked at **four** sessions and fell by half at sixteen, while
     * the longest event-loop stall grew from 14ms to 98ms.
     *
     * Raise this only with a measurement showing it helps on the device in question.
     */
    static readonly DEFAULT_POOL_SIZE = 4;

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
     * startup and cannot be changed afterwards.
     *
     * It bounds how many device calls can be in flight, and against a local software module that
     * made it the ceiling: raising it from 4 to 16 nearly doubled throughput. Against a
     * network-attached device it is **not** the binding constraint — the synchronous `C_SignInit`
     * on the main thread is — so raising it there changes little. Surfaced because which of the
     * two limits applies depends on the device, and neither is visible from configuration.
     */
    static threadPoolSize(): number {
        const configured = Number(process.env.UV_THREADPOOL_SIZE);

        return Number.isFinite(configured) && configured > 0 ? configured : 4;
    }
}
