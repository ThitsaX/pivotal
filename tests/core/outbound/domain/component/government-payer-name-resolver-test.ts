import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {GovernmentPayerDisplayNameStore} from '../../../../../packages/core/outbound/domain/component/government-payer-display-name-store';
import {GovernmentPayerNameResolver} from '../../../../../packages/core/outbound/domain/component/government-payer-name-resolver';
import {FspParty} from '../../../../../packages/core/outbound/domain/dto';
import {PartyIdType} from '../../../../../packages/shared/fspiop';

class MapGovernmentPayerDisplayNameStore extends GovernmentPayerDisplayNameStore {
    constructor(private readonly names: ReadonlyMap<string, string>) {
        super();
    }

    get(fspId: string): string | undefined {
        return this.names.get(fspId);
    }
}

function party(displayName?: string): FspParty {
    const value = new FspParty();
    value.idType = PartyIdType.Msisdn;
    value.idValue = '2769100001';
    value.fspId = 'otherfsp';
    value.displayName = displayName;
    return value;
}

function resolver(): GovernmentPayerNameResolver {
    return new GovernmentPayerNameResolver(
        new MapGovernmentPayerDisplayNameStore(new Map([['payerfsp', 'Treasury']])),
    );
}

describe('GovernmentPayerNameResolver', () => {
    it('fills a blank name for each government-to-person sub-scenario', () => {
        const subScenarios = [
            'GOVERNMENT_TO_PERSON',
            'GOVERNMENT_TO_PERSON_DISBURSE',
            'GOVERNMENT_TO_PERSON_REFUND',
            'GOVERNMENT_TO_PERSON_SALARY',
        ];

        for (const subScenario of subScenarios) {
            const from = party();
            const resolved = resolver().resolve('payerfsp', from, subScenario);

            assert.equal(resolved.displayName, 'Treasury', subScenario);
            assert.notEqual(resolved, from, subScenario);
            assert.equal(from.displayName, undefined, subScenario);
        }
    });

    it('leaves near-miss sub-scenarios unchanged', () => {
        for (const subScenario of ['GOVERNMENT_TO_PERSONAL', 'PERSON_TO_PERSON']) {
            const from = party();
            const resolved = resolver().resolve('payerfsp', from, subScenario);

            assert.equal(resolved, from, subScenario);
            assert.equal(resolved.displayName, undefined, subScenario);
        }
    });

    it('keeps a name the sender sent and treats whitespace as blank', () => {
        const named = party('Sender Name');
        const kept = resolver().resolve('payerfsp', named, 'GOVERNMENT_TO_PERSON');

        assert.equal(kept, named);
        assert.equal(kept.displayName, 'Sender Name');

        const blank = party('   ');
        const filled = resolver().resolve('payerfsp', blank, 'GOVERNMENT_TO_PERSON');

        assert.notEqual(filled, blank);
        assert.equal(filled.displayName, 'Treasury');
        assert.equal(blank.displayName, '   ');
    });

    it('leaves the payer unchanged when the sending DFSP has no name configured', () => {
        const from = party();
        const resolved = new GovernmentPayerNameResolver(
            new MapGovernmentPayerDisplayNameStore(new Map()),
        ).resolve('payerfsp', from, 'GOVERNMENT_TO_PERSON');

        assert.equal(resolved, from);
        assert.equal(resolved.displayName, undefined);
    });
});
