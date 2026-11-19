import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {Participant} from '../../../../../packages/core/participant/domain/model';
import {ParticipantRepository} from '../../../../../packages/core/participant/domain/repository';
import {
    GetGovernmentPayerDisplayNameHandler,
    GetGovernmentPayerDisplayNameQuery,
} from '../../../../../packages/core/participant/domain/query';
import {PivotalException} from '../../../../../packages/shared/foundation/exception';
import {DbTarget} from '../../../../../packages/shared/typeorm';

function participant(name: string, displayName?: string | null): Participant {
    const row = new Participant(name, null, null, 'access-key', `id-${name}`);
    row.governmentPayerDisplayName = displayName;
    return row;
}

function makeHandler(rows: Participant[], targets: DbTarget[] = []): GetGovernmentPayerDisplayNameHandler {
    const repository = {
        async findByName(name: string, target: DbTarget): Promise<Participant | null> {
            targets.push(target);
            return rows.find(row => row.name === name) ?? null;
        },
    } as unknown as ParticipantRepository;

    return new GetGovernmentPayerDisplayNameHandler(repository);
}

const query = (fspId: string) =>
    new GetGovernmentPayerDisplayNameQuery(new GetGovernmentPayerDisplayNameQuery.Input(fspId));

describe('GetGovernmentPayerDisplayNameHandler', () => {

    it('returns the stored name', async () => {
        const targets: DbTarget[] = [];

        const output = await makeHandler(
            [participant('DemoDFSP1', 'Treasury')],
            targets,
        ).execute(query(' DemoDFSP1 '));

        assert.equal(output.fspId, 'DemoDFSP1');
        assert.equal(output.displayName, 'Treasury');
        assert.deepEqual(targets, [DbTarget.Write]);
    });

    it('returns null when no name is stored', async () => {
        const output = await makeHandler([participant('DemoDFSP1')]).execute(query('DemoDFSP1'));

        assert.equal(output.displayName, null);
    });

    it('rejects an unknown or blank participant with the catalogued error', async () => {
        const handler = makeHandler([]);

        for (const fspId of ['Unknown', '   ']) {
            await assert.rejects(
                handler.execute(query(fspId)),
                (error: unknown) => error instanceof PivotalException && error.code === 'PARTICIPANT_UNKNOWN',
            );
        }
    });
});
