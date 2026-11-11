import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
    SigningTenantConsumer,
} from '../../../../../packages/core/trust/domain/component/signing-tenant.consumer';
import {
    PermanentPublishError,
} from '../../../../../packages/core/trust/domain/component/signing-tenant.error';
import {McmException} from '../../../../../packages/shared/mcm-client/exception/mcm-exception';

/** The two decisions are static and pure, so they are exercised directly. */
const isPermanent = (SigningTenantConsumer as any).isPermanent as (e: unknown) => boolean;
const backoffMs = (SigningTenantConsumer as any).backoffMs as (n: number) => number;

describe('SigningTenantConsumer.isPermanent', () => {

    it('should treat a tenant with no key of ours as permanent', () => {
        // Onboarding never finished, or the row was removed. Waiting does not create a key.
        assert.equal(isPermanent(new PermanentPublishError('No self-role public key held.')), true);
    });

    it('should treat a 404 from MCM as permanent', () => {
        // The case that caused the incident: onboarded here, never registered there.
        const error = new McmException('MCM_REQUEST_FAILED', 'not found', 404);

        assert.equal(isPermanent(error), true);
    });

    it('should treat other 4xx answers as permanent', () => {
        for (const status of [400, 401, 403, 409, 422]) {
            assert.equal(isPermanent(new McmException('MCM_REQUEST_FAILED', 'no', status)), true,
                `status ${status}`);
        }
    });

    it('should treat 408 and 429 as transient, despite being 4xx', () => {
        // Neither says the request is wrong. One says MCM ran out of time, the other that it wants
        // us to slow down -- which is what retrying with a delay does.
        assert.equal(isPermanent(new McmException('MCM_REQUEST_FAILED', 'timeout', 408)), false);
        assert.equal(isPermanent(new McmException('MCM_REQUEST_FAILED', 'slow down', 429)), false);
    });

    it('should treat 5xx as transient', () => {
        assert.equal(isPermanent(new McmException('MCM_REQUEST_FAILED', 'boom', 500)), false);
        assert.equal(isPermanent(new McmException('MCM_REQUEST_FAILED', 'gateway', 503)), false);
    });

    it('should treat no answer at all as transient', () => {
        // A refused connection or a timeout carries no status. MCM being down is the expected
        // reason to be here and it ends by itself.
        assert.equal(isPermanent(new McmException('MCM_REQUEST_FAILED', 'ECONNREFUSED')), false);
        assert.equal(isPermanent(new Error('socket hang up')), false);
    });
});

describe('SigningTenantConsumer.backoffMs', () => {

    it('should never redeliver immediately', () => {
        // The whole incident was a nak with no delay: redelivery bounded only by how fast the far
        // end could answer, which reached three hundred requests a second.
        for (let n = 1; n <= 50; n++) {
            assert.ok(backoffMs(n) >= 5_000, `attempt ${n} waited ${backoffMs(n)}ms`);
        }
    });

    it('should start at five seconds and double', () => {
        assert.equal(backoffMs(1), 5_000);
        assert.equal(backoffMs(2), 10_000);
        assert.equal(backoffMs(3), 20_000);
        assert.equal(backoffMs(4), 40_000);
    });

    it('should cap at five minutes rather than growing without bound', () => {
        assert.equal(backoffMs(20), 300_000);
        assert.equal(backoffMs(1000), 300_000);
    });

    it('should hold up under a redelivery count of zero', () => {
        // Defensive: the field is documented as starting at 1, and an exponent of -1 would
        // otherwise produce a delay shorter than the floor.
        assert.equal(backoffMs(0), 5_000);
    });
});
