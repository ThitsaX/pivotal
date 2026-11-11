import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {PivotalException} from '../../../../../packages/shared/foundation/exception';
import {DbTarget} from '../../../../../packages/shared/typeorm';
import {GetJwsPolicyHandler, GetJwsPolicyQuery} from '../../../../../packages/core/participant/domain/query';
import {ParticipantKey, ParticipantKeyRole} from '../../../../../packages/core/participant/domain/model';
import {ParticipantKeyRepository} from '../../../../../packages/core/participant/domain/repository';

function key(fspId: string, overrides: Partial<ParticipantKey> = {}): ParticipantKey {
    const row = new ParticipantKey();
    row.fspId = fspId;
    row.role = ParticipantKeyRole.Self;
    row.jwsPublicKey = '-----BEGIN PUBLIC KEY-----\nAAAA\n-----END PUBLIC KEY-----';
    row.jwsPrivateKey = null;
    row.jwsSignEnabled = true;
    row.jwsVerifyMode = 'verify-if-present';

    return Object.assign(row, overrides);
}

function makeHandler(rows: ParticipantKey[], targets: DbTarget[] = []): GetJwsPolicyHandler {
    const repository = {
        async findByFspId(fspId: string, target: DbTarget): Promise<ParticipantKey | null> {
            targets.push(target);
            return rows.find(row => row.fspId === fspId) ?? null;
        },
    } as unknown as ParticipantKeyRepository;

    return new GetJwsPolicyHandler(repository);
}

const query = (fspId: string) => new GetJwsPolicyQuery(new GetJwsPolicyQuery.Input(fspId));

describe('GetJwsPolicyHandler', () => {

    it('returns the current switches for a signing tenant', async () => {
        const output = await makeHandler([key('DemoDFSP1')]).execute(query(' DemoDFSP1 '));

        assert.deepEqual({...output}, {
            fspId:          'DemoDFSP1',
            role:           'self',
            hasPublicKey:   true,
            jwsSignEnabled: true,
            jwsVerifyMode:  'verify-if-present',
        });
    });

    it('reports a peer and a missing key, so the screen can explain why signing stays off', async () => {
        const output = await makeHandler([
            key('PeerBank', {role: ParticipantKeyRole.Peer, jwsPublicKey: null, jwsSignEnabled: false, jwsVerifyMode: 'off'}),
        ]).execute(query('PeerBank'));

        assert.equal(output.role, 'peer');
        assert.equal(output.hasPublicKey, false);
        assert.equal(output.jwsSignEnabled, false);
    });

    it('reads from the writer, so a change is never based on a stale value', async () => {
        const targets: DbTarget[] = [];

        await makeHandler([key('DemoDFSP1')], targets).execute(query('DemoDFSP1'));

        assert.deepEqual(targets, [DbTarget.Write]);
    });

    it('rejects an unknown or blank participant with the catalogued error', async () => {
        const handler = makeHandler([]);

        for (const fspId of ['Unknown', '   ']) {
            await assert.rejects(handler.execute(query(fspId)), (error: unknown) =>
                error instanceof PivotalException && error.code === 'PARTICIPANT_KEY_NOT_FOUND');
        }
    });
});
