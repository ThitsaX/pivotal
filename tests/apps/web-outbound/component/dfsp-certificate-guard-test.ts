import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
    DfspCertificateGuard,
} from '../../../../packages/apps/web-outbound/component/dfsp-certificate.guard';
import {
    ParticipantCertStatusCode,
} from '../../../../packages/core/participant/domain/model/participant-cert-status.model';

const WALLET1_HASH = 'fe805c4c7baff3bc945a1757284fbba3ac592746185d47c74bd517e2f771aefd';
const WALLET2_HASH = 'aa'.repeat(32);

function row(overrides: Record<string, unknown> = {}): any {
    return {
        fspId: 'wallet1',
        fingerprintSha256: WALLET1_HASH,
        status: ParticipantCertStatusCode.ACTIVE,
        validFrom: new Date(Date.now() - 86_400_000),
        validTo: new Date(Date.now() + 86_400_000),
        ...overrides,
    };
}

class FakeCertRepository {

    readonly lookups: string[] = [];

    constructor(private readonly rows: any[] = []) {
    }

    findByFingerprint(fingerprint: string): Promise<any | null> {
        this.lookups.push(fingerprint);
        return Promise.resolve(this.rows.find(r => r.fingerprintSha256 === fingerprint) ?? null);
    }
}

const reflector = {getAllAndOverride: () => false} as any;

function contextWith(headers: Record<string, string>): any {
    return {
        switchToHttp: () => ({getRequest: () => ({headers})}),
        getHandler: () => undefined,
        getClass: () => undefined,
    };
}

function guard(repository: FakeCertRepository, enabled = true): DfspCertificateGuard {
    return new DfspCertificateGuard(repository as any, enabled, reflector);
}

function headers(hash: string | null, source: string | null): Record<string, string> {
    return {
        ...(hash == null ? {} : {'x-forwarded-client-cert': `Hash=${hash}`}),
        ...(source == null ? {} : {'fspiop-source': source}),
    };
}

describe('DfspCertificateGuard', () => {

    it('should admit a request whose certificate and fspiop-source agree', async () => {
        const repository = new FakeCertRepository([row()]);

        assert.equal(
            await guard(repository).canActivate(contextWith(headers(WALLET1_HASH, 'wallet1'))),
            true);

        assert.deepEqual(repository.lookups, [WALLET1_HASH]);
    });

    it('should reject a valid certificate used to claim another participant', async () => {
        // The reason this guard exists. wallet2 is legitimately enrolled; presenting their own
        // certificate while claiming wallet1 is what a leaked accessKey would otherwise enable.
        const repository = new FakeCertRepository([
            row(),
            row({fspId: 'wallet2', fingerprintSha256: WALLET2_HASH}),
        ]);

        await assert.rejects(
            guard(repository).canActivate(contextWith(headers(WALLET2_HASH, 'wallet1'))),
            /does not belong to the participant named in fspiop-source/);
    });

    it('should reject a request carrying no client certificate', async () => {
        await assert.rejects(
            guard(new FakeCertRepository()).canActivate(contextWith(headers(null, 'wallet1'))),
            /No verified client certificate/);
    });

    it('should reject a fingerprint this deployment never issued', async () => {
        // The row is the only record a certificate exists, so a miss means it was not issued here.
        await assert.rejects(
            guard(new FakeCertRepository()).canActivate(contextWith(headers(WALLET1_HASH, 'wallet1'))),
            /not recognised/);
    });

    it('should reject a revoked certificate', async () => {
        const repository = new FakeCertRepository([
            row({status: ParticipantCertStatusCode.REVOKED}),
        ]);

        await assert.rejects(
            guard(repository).canActivate(contextWith(headers(WALLET1_HASH, 'wallet1'))),
            /has been revoked/);
    });

    it('should reject an expired certificate even while the row still says active', async () => {
        // Expiry is a fact about the clock, not an event: nothing relabels the row at the moment
        // it lapses, so validity has to be evaluated here rather than trusted from status.
        const repository = new FakeCertRepository([
            row({validTo: new Date(Date.now() - 1000)}),
        ]);

        await assert.rejects(
            guard(repository).canActivate(contextWith(headers(WALLET1_HASH, 'wallet1'))),
            /not currently valid/);
    });

    it('should reject a certificate that is not valid yet', async () => {
        const repository = new FakeCertRepository([
            row({validFrom: new Date(Date.now() + 86_400_000)}),
        ]);

        await assert.rejects(
            guard(repository).canActivate(contextWith(headers(WALLET1_HASH, 'wallet1'))),
            /not currently valid/);
    });

    it('should admit a retiring certificate, which is still the DFSP’s to use', async () => {
        // Renewal supersedes rather than replaces: the previous certificate keeps working until it
        // expires, so the DFSP installs the new one on its own schedule.
        const repository = new FakeCertRepository([
            row({status: ParticipantCertStatusCode.RETIRING}),
        ]);

        assert.equal(
            await guard(repository).canActivate(contextWith(headers(WALLET1_HASH, 'wallet1'))),
            true);
    });

    it('should reject a request with no fspiop-source, before any lookup', async () => {
        const repository = new FakeCertRepository([row()]);

        await assert.rejects(
            guard(repository).canActivate(contextWith(headers(WALLET1_HASH, null))),
            /Missing mandatory header: fspiop-source/);

        assert.equal(repository.lookups.length, 0);
    });

    it('should reject a malformed header rather than looking it up', async () => {
        const repository = new FakeCertRepository([row()]);

        await assert.rejects(
            guard(repository).canActivate(contextWith({
                'x-forwarded-client-cert': 'Hash=not-a-digest',
                'fspiop-source': 'wallet1',
            })),
            /No verified client certificate/);

        assert.equal(repository.lookups.length, 0);
    });

    it('should let everything through while the leg is not yet switched on', async () => {
        // The migration property: the endpoint runs beside the existing one, so callers that have
        // not enrolled are unaffected until the flag is turned on for them.
        const repository = new FakeCertRepository();

        assert.equal(
            await guard(repository, false).canActivate(contextWith({})),
            true);

        assert.equal(repository.lookups.length, 0);
    });
});
