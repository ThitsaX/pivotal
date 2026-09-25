// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Logger} from '@nestjs/common';
import * as pkcs11js from 'pkcs11js';
import {Pkcs11Settings} from './pkcs11-settings';

/** A session lent out by the pool, with the handle needed to use it. */
export interface Pkcs11Lease {
    readonly session: Buffer;
}

/**
 * Owns the device connection: the library, the login, and a fixed set of sessions.
 *
 * **Why a pool rather than one session.** PKCS#11 carries one operation per session at a time.
 * `C_SignInit` opens an operation and `C_Sign` closes it, so a second init in between returns
 * `CKR_OPERATION_ACTIVE` — signing every tenant through one session would serialise all signing
 * across all tenants, and no amount of device capacity relieves it. The failure only appears under
 * concurrent load, which is why the pool is a requirement rather than a later optimisation.
 *
 * **Why the login is not per session.** PKCS#11 login state belongs to the *token* for the
 * application, not to a session, so authenticating once covers every session opened afterwards. A
 * second `C_Login` returns `CKR_USER_ALREADY_LOGGED_IN`.
 */
export class Pkcs11SessionPool {

    private readonly logger = new Logger(Pkcs11SessionPool.name);

    private readonly pkcs11 = new pkcs11js.PKCS11();

    private readonly available: Buffer[] = [];

    /** Callers waiting for a session, served in arrival order. */
    private readonly waiting: ((session: Buffer) => void)[] = [];

    private started = false;

    /** True where a single crypto user is logged in for the life of the process. */
    private hasStandingLogin = false;

    private slot: Buffer | undefined;

    /** Tail of the per-tenant queue; see {@link withTenantLogin}. */
    private tenantLogin: Promise<void> = Promise.resolve();

    constructor(private readonly settings: Pkcs11Settings) {
    }

    /**
     * Loads the library, and where a standing identity is given, logs in and opens the sessions.
     *
     * **Two modes, because two kinds of workload use a device differently.** One that *signs* has a
     * single crypto user for the life of the process and pools sessions under it. One that
     * *provisions* has no identity of its own — it borrows each tenant's, generates that tenant's
     * key as its owner, and gives the identity back. Passing no credential selects the second.
     *
     * They cannot be combined, and the device is what decides that: login belongs to the token for
     * the whole application, so logging in as a tenant would replace the standing login underneath
     * every session already signing with it.
     *
     * Called at startup rather than lazily: a deployment that cannot reach its device should fail
     * where that is visible, not on the first payment.
     */
    async start(credential?: Pkcs11SessionPool.Credential): Promise<void> {

        if (this.started) {
            return;
        }

        this.pkcs11.load(this.settings.modulePath);

        // Without this the library is entitled to assume single-threaded access, and the async
        // calls below run on libuv's thread pool -- several threads. Omitting it does not fail
        // cleanly; it corrupts the library's own state under concurrency.
        this.pkcs11.C_Initialize({flags: pkcs11js.CKF_OS_LOCKING_OK});

        this.slot = this.findSlot();
        this.started = true;

        if (credential == null) {
            this.logger.log(
                `PKCS#11 ready on token '${this.settings.tokenLabel}' via `
                + `${this.settings.modulePath}. No standing identity: this process authenticates `
                + 'as a tenant for each operation.',
            );
            return;
        }

        // Opened first and kept, because login is a property of the token and needs some session
        // to be made through.
        const first = this.pkcs11.C_OpenSession(this.slot, pkcs11js.CKF_SERIAL_SESSION);

        // CloudHSM authenticates with a username and a password; SoftHSM has only a PIN and
        // ignores the username. Both are carried so that moving to hardware changes the module
        // path and nothing else -- not the secret's shape, and not this call.
        this.pkcs11.C_Login(
            first, pkcs11js.CKU_USER,
            Pkcs11SessionPool.pin(credential.username, credential.password));

        this.hasStandingLogin = true;
        this.available.push(first);

        for (let i = 1; i < this.settings.poolSize; i++) {
            this.available.push(this.pkcs11.C_OpenSession(this.slot, pkcs11js.CKF_SERIAL_SESSION));
        }

        this.logger.log(
            `PKCS#11 ready: ${this.settings.poolSize} sessions on token `
            + `'${this.settings.tokenLabel}' via ${this.settings.modulePath} `
            + `(thread pool ${Pkcs11Settings.threadPoolSize()}).`,
        );
    }

    /**
     * Runs `work` authenticated as one tenant's crypto user, then gives the identity back.
     *
     * **Serialised, and it has to be.** Login belongs to the token rather than to a session, so two
     * of these overlapping would mean the second tenant's login silently replacing the first while
     * the first was still generating — producing a key owned by the wrong tenant. Ownership is
     * conferred at creation and cannot be transferred, so that key could only be destroyed and
     * remade. Onboarding is rare and latency-insensitive, so queueing costs nothing worth having.
     */
    async withTenantLogin<T>(
        credential: Pkcs11SessionPool.Credential,
        work: (pkcs11: pkcs11js.PKCS11, session: Buffer) => Promise<T>,
    ): Promise<T> {

        if (!this.started) {
            throw new Error('PKCS#11 session pool was not started.');
        }

        if (this.hasStandingLogin) {
            throw new Error(
                'Cannot authenticate as a tenant: this process holds a standing login, and a '
                + 'second login would replace it for every session already using it.',
            );
        }

        // Chained rather than locked: each call waits on the previous one's completion, so the
        // queue is the promise itself and there is no lock to leak on an error path.
        const previous = this.tenantLogin;
        let release: () => void = () => undefined;
        this.tenantLogin = new Promise<void>(resolve => { release = resolve; });

        await previous;

        const session = this.pkcs11.C_OpenSession(this.slot!, pkcs11js.CKF_SERIAL_SESSION
            | pkcs11js.CKF_RW_SESSION);

        try {
            this.pkcs11.C_Login(
                session, pkcs11js.CKU_USER,
                Pkcs11SessionPool.pin(credential.username, credential.password));

            return await work(this.pkcs11, session);

        } finally {
            // Logged out before the session closes, and before the next tenant is let in. Leaving
            // a login behind would hand the next caller this tenant's rights.
            try { this.pkcs11.C_Logout(session); } catch { /* not logged in; nothing to undo */ }
            try { this.pkcs11.C_CloseSession(session); } catch { /* already gone */ }
            release();
        }
    }

    /**
     * Runs `work` on a session held exclusively for its duration.
     *
     * Exclusivity is the point: it is what keeps two operations off one session. The session is
     * returned whether `work` resolves or throws, because a session lost on an error path shrinks
     * the pool permanently and the symptom is a service that slows down over days.
     */
    async withSession<T>(work: (pkcs11: pkcs11js.PKCS11, session: Buffer) => Promise<T>): Promise<T> {

        if (!this.started) {
            throw new Error('PKCS#11 session pool was not started.');
        }

        // Refused rather than queued. A process started without a standing identity has no pooled
        // sessions and never will, so a caller waiting for one waits forever -- and a request that
        // hangs is harder to diagnose than one that fails saying why.
        if (!this.hasStandingLogin) {
            throw new Error(
                'Cannot sign: this process has no standing identity on the device. It was started '
                + 'for provisioning, which authenticates as a tenant per operation.',
            );
        }

        const session = await this.acquire();

        try {
            return await work(this.pkcs11, session);
        } finally {
            this.release(session);
        }
    }

    async stop(): Promise<void> {

        if (!this.started) {
            return;
        }

        this.started = false;

        for (const session of this.available.splice(0)) {
            try {
                this.pkcs11.C_CloseSession(session);
            } catch {
                // Shutting down. A session that will not close changes nothing once the library
                // is finalized, and throwing here would mask whatever is actually stopping us.
            }
        }

        try {
            this.pkcs11.C_Finalize();
        } catch {
            // Same reasoning.
        }
    }

    private async acquire(): Promise<Buffer> {

        const free = this.available.pop();

        if (free != null) {
            return free;
        }

        // Queued rather than rejected. Every session being busy is ordinary load, and failing a
        // payment for it would turn a millisecond of contention into a declined transfer.
        return new Promise<Buffer>(resolve => this.waiting.push(resolve));
    }

    private release(session: Buffer): void {

        const next = this.waiting.shift();

        if (next != null) {
            next(session);
            return;
        }

        this.available.push(session);
    }

    /**
     * Finds the token to work on.
     *
     * **A label is optional where the device presents one token**, because on such a device the
     * label is the vendor's, not something a deployment chooses — CloudHSM presents a single token
     * per cluster and names it itself. Requiring the label there would make an operator look up a
     * value they cannot influence and copy it into configuration that gains nothing from holding
     * it. Where more than one token exists, as on a device given a token per tenant, the label is
     * the only thing that says which one this workload was given, and is then required.
     */
    private findSlot(): Buffer {

        const slots = this.pkcs11.C_GetSlotList(true);
        const wanted = this.settings.tokenLabel.trim();

        if (wanted.length === 0) {

            if (slots.length === 1) {
                return slots[0];
            }

            throw new Error(
                `${slots.length} PKCS#11 tokens are present in ${this.settings.modulePath} and no `
                + 'token label is configured. Set one, or this workload cannot tell which token it '
                + 'was given.',
            );
        }

        for (const slot of slots) {
            if (this.pkcs11.C_GetTokenInfo(slot).label.trim() === wanted) {
                return slot;
            }
        }

        throw new Error(
            `No PKCS#11 token labelled '${wanted}' among ${slots.length} slot(s) in `
            + `${this.settings.modulePath}.`,
        );
    }

    /**
     * CloudHSM takes `user:password` as the PIN; SoftHSM takes the PIN alone.
     *
     * Deciding on the presence of a username rather than on a configured backend keeps the two
     * paths from needing a switch that someone has to remember to set.
     */
    private static pin(username: string, password: string): string {
        return username.trim().length > 0 ? `${username.trim()}:${password}` : password;
    }
}

export namespace Pkcs11SessionPool {

    /**
     * A crypto user's credential.
     *
     * `username` is empty on a device with no user model — SoftHSM authenticates with a PIN alone.
     * Carried regardless so that moving to hardware changes the module path and nothing else.
     */
    export interface Credential {
        readonly username: string;
        readonly password: string;
    }
}
