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

    constructor(private readonly settings: Pkcs11Settings) {
    }

    /**
     * Loads the library, logs in, and opens the sessions.
     *
     * Called at startup rather than lazily: a deployment that cannot reach its device should fail
     * where that is visible, not on the first payment.
     */
    async start(username: string, password: string): Promise<void> {

        if (this.started) {
            return;
        }

        this.pkcs11.load(this.settings.modulePath);

        // Without this the library is entitled to assume single-threaded access, and the async
        // calls below run on libuv's thread pool -- several threads. Omitting it does not fail
        // cleanly; it corrupts the library's own state under concurrency.
        this.pkcs11.C_Initialize({flags: pkcs11js.CKF_OS_LOCKING_OK});

        const slot = this.findSlot();

        // Opened first and kept, because login is a property of the token and needs some session
        // to be made through.
        const first = this.pkcs11.C_OpenSession(slot, pkcs11js.CKF_SERIAL_SESSION);

        // CloudHSM authenticates with a username and a password; SoftHSM has only a PIN and
        // ignores the username. Both are carried so that moving to hardware changes the module
        // path and nothing else -- not the secret's shape, and not this call.
        this.pkcs11.C_Login(first, pkcs11js.CKU_USER, Pkcs11SessionPool.pin(username, password));

        this.available.push(first);

        for (let i = 1; i < this.settings.poolSize; i++) {
            this.available.push(this.pkcs11.C_OpenSession(slot, pkcs11js.CKF_SERIAL_SESSION));
        }

        this.started = true;

        this.logger.log(
            `PKCS#11 ready: ${this.settings.poolSize} sessions on token `
            + `'${this.settings.tokenLabel}' via ${this.settings.modulePath} `
            + `(thread pool ${Pkcs11Settings.threadPoolSize()}).`,
        );
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

    private findSlot(): Buffer {

        const slots = this.pkcs11.C_GetSlotList(true);
        const wanted = this.settings.tokenLabel.trim();

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
