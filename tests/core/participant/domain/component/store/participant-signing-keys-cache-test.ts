import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {ParticipantSigningKeysCache} from '../../../../../../packages/core/participant/domain/component/store/participant-signing-keys-cache';
import {Participant} from '../../../../../../packages/core/participant/domain/model';
import {ParticipantKeyRepository, ParticipantRepository} from '../../../../../../packages/core/participant/domain/repository';

function participant(name: string, displayName?: string | null): Participant {
    const row = new Participant(name, null, null, 'access-key', `id-${name}`);
    row.governmentPayerDisplayName = displayName;
    return row;
}

function cacheFor(rows: Participant[]): ParticipantSigningKeysCache {
    const participants = {
        async findAll(): Promise<Participant[]> {
            return rows;
        },
    } as unknown as ParticipantRepository;
    const keys = {
        async findAll(): Promise<never[]> {
            return [];
        },
    } as unknown as ParticipantKeyRepository;

    return new ParticipantSigningKeysCache(participants, keys);
}

describe('ParticipantSigningKeysCache government payer display name', () => {

    it('trims a stored name and skips blank or null names', async () => {
        const cache = cacheFor([
            participant('payerfsp', '  Treasury  '),
            participant('blank', '   '),
            participant('empty', ''),
            participant('unset', null),
        ]);

        await (cache as unknown as {refreshParticipantSigningKeys(): Promise<void>})
            .refreshParticipantSigningKeys();

        assert.equal(cache.getGovernmentPayerDisplayName('payerfsp'), 'Treasury');
        assert.equal(cache.getGovernmentPayerDisplayName('blank'), undefined);
        assert.equal(cache.getGovernmentPayerDisplayName('empty'), undefined);
        assert.equal(cache.getGovernmentPayerDisplayName('unset'), undefined);
    });
});
