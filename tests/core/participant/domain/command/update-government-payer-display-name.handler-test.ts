import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
    UpdateGovernmentPayerDisplayNameCommand,
    UpdateGovernmentPayerDisplayNameHandler,
} from '../../../../../packages/core/participant/domain/command';
import {Participant} from '../../../../../packages/core/participant/domain/model';
import {ParticipantRepository} from '../../../../../packages/core/participant/domain/repository';
import {PivotalException} from '../../../../../packages/shared/foundation/exception';
import {DbTarget} from '../../../../../packages/shared/typeorm';

function participant(name: string, displayName?: string | null): Participant {
    const row = new Participant(name, null, null, 'access-key', `id-${name}`);
    row.governmentPayerDisplayName = displayName;
    return row;
}

function makeHandler(rows: Participant[], targets: DbTarget[] = []): UpdateGovernmentPayerDisplayNameHandler {
    const repository = {
        async findByName(name: string, target: DbTarget): Promise<Participant | null> {
            targets.push(target);
            return rows.find(row => row.name === name) ?? null;
        },
        async save(row: Participant): Promise<Participant> {
            return row;
        },
    } as unknown as ParticipantRepository;

    return new UpdateGovernmentPayerDisplayNameHandler(repository);
}

const command = (fspId: string, displayName: string | null) =>
    new UpdateGovernmentPayerDisplayNameCommand(
        new UpdateGovernmentPayerDisplayNameCommand.Input(fspId, displayName),
    );

describe('UpdateGovernmentPayerDisplayNameHandler', () => {

    it('trims the name and stores it on the participant', async () => {
        const row = participant('DemoDFSP1');
        const targets: DbTarget[] = [];

        const output = await makeHandler([row], targets).execute(command(' DemoDFSP1 ', '  Treasury  '));

        assert.equal(output.fspId, 'DemoDFSP1');
        assert.equal(output.displayName, 'Treasury');
        assert.equal(row.governmentPayerDisplayName, 'Treasury');
        assert.deepEqual(targets, [DbTarget.Write]);
    });

    it('accepts a name of 128 characters', async () => {
        const row = participant('DemoDFSP1');
        const displayName = 'a'.repeat(128);

        const output = await makeHandler([row]).execute(command('DemoDFSP1', displayName));

        assert.equal(output.displayName, displayName);
    });

    it('clears the name when the value is blank or null', async () => {
        const row = participant('DemoDFSP1', 'Treasury');
        const handler = makeHandler([row]);

        for (const displayName of ['', '   ', null]) {
            const output = await handler.execute(command('DemoDFSP1', displayName));
            assert.equal(output.displayName, null);
            assert.equal(row.governmentPayerDisplayName, null);
        }
    });

    it('rejects a name longer than 128 characters', async () => {
        const handler = makeHandler([participant('DemoDFSP1', 'Treasury')]);

        await assert.rejects(
            handler.execute(command('DemoDFSP1', 'a'.repeat(129))),
            (error: unknown) => error instanceof PivotalException
                && error.code === 'PARTICIPANT_GOVERNMENT_PAYER_DISPLAY_NAME_TOO_LONG',
        );
    });

    it('rejects an unknown or blank participant with the catalogued error', async () => {
        const handler = makeHandler([participant('DemoDFSP1')]);

        for (const fspId of ['Unknown', '   ']) {
            await assert.rejects(
                handler.execute(command(fspId, 'Treasury')),
                (error: unknown) => error instanceof PivotalException && error.code === 'PARTICIPANT_UNKNOWN',
            );
        }
    });
});
