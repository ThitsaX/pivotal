import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    DatabaseJwsPrivateKeySource,
    VaultJwsPrivateKeySource,
} from '../../../../../../packages/core/participant/domain/component/store/jws-private-key-source';
import {
    ParticipantKey,
    ParticipantKeyRole,
} from '../../../../../../packages/core/participant/domain/model/participant-key.model';
import { VaultSettings } from '../../../../../../packages/shared/vault';

function participantKey(overrides: Partial<ParticipantKey>): ParticipantKey {
    const key = new ParticipantKey();

    key.fspId = 'payerfsp';
    key.role = ParticipantKeyRole.Self;
    key.jwsPublicKey = 'PUB';
    key.jwsPrivateKey = 'PRIV';
    key.jwsSignEnabled = true;
    key.jwsVerifyMode = 'off';

    return Object.assign(key, overrides);
}

/** Stands in for VaultClient; records reads and can be told to fail. */
class FakeVaultClient {
    readonly reads: string[] = [];
    invalidated = 0;

    constructor(
        private readonly values: Record<string, string | undefined>,
        private readonly failFor: Set<string> = new Set(),
    ) {}

    async readKvField(path: string): Promise<string | undefined> {
        this.reads.push(path);

        if (this.failFor.has(path)) {
            throw new Error('vault unavailable');
        }

        return this.values[path];
    }

    invalidateToken(): void {
        this.invalidated += 1;
    }
}

const SETTINGS = new VaultSettings('https://vault:8200', 'pivotal');

function vaultSource(client: FakeVaultClient): VaultJwsPrivateKeySource {
    return new VaultJwsPrivateKeySource(client as never, SETTINGS);
}

describe('DatabaseJwsPrivateKeySource', () => {

    it('should return keys for enabled self tenants', async () => {
        const keys = await new DatabaseJwsPrivateKeySource().resolve([participantKey({})], new Map());

        assert.equal(keys.get('payerfsp'), 'PRIV');
    });

    it('should skip a tenant that is keyed but not switched on', async () => {
        const keys = await new DatabaseJwsPrivateKeySource()
            .resolve([participantKey({ jwsSignEnabled: false })], new Map());

        assert.equal(keys.size, 0);
    });

    it('should skip peers, which hold no private key', async () => {
        const keys = await new DatabaseJwsPrivateKeySource()
            .resolve([participantKey({ role: ParticipantKeyRole.Peer })], new Map());

        assert.equal(keys.size, 0);
    });

    it('should normalise escaped newlines', async () => {
        const keys = await new DatabaseJwsPrivateKeySource()
            .resolve([participantKey({ jwsPrivateKey: 'line1\\nline2' })], new Map());

        assert.equal(keys.get('payerfsp'), 'line1\nline2');
    });
});

describe('VaultJwsPrivateKeySource', () => {

    it('should read each signing tenant from its own path', async () => {
        const client = new FakeVaultClient({
            'pivotal/jwskey/payerfsp': 'PEM-A',
            'pivotal/jwskey/payeefsp': 'PEM-B',
        });

        const keys = await vaultSource(client).resolve(
            [participantKey({ fspId: 'payerfsp' }), participantKey({ fspId: 'payeefsp' })],
            new Map(),
        );

        assert.deepEqual(client.reads, ['pivotal/jwskey/payerfsp', 'pivotal/jwskey/payeefsp']);
        assert.equal(keys.get('payerfsp'), 'PEM-A');
        assert.equal(keys.get('payeefsp'), 'PEM-B');
    });

    it('should not read Vault for tenants that are not switched on', async () => {
        const client = new FakeVaultClient({});

        await vaultSource(client).resolve(
            [participantKey({ jwsSignEnabled: false }), participantKey({ role: ParticipantKeyRole.Peer })],
            new Map(),
        );

        assert.equal(client.reads.length, 0);
    });

    it('should omit a tenant that is switched on but never provisioned', async () => {
        const client = new FakeVaultClient({});

        const keys = await vaultSource(client).resolve([participantKey({})], new Map());

        assert.equal(keys.size, 0);
    });

    it('should carry the previous key forward when Vault fails', async () => {
        // A Vault blip must not silently stop a tenant signing: the key has not changed, only our
        // ability to re-read it.
        const client = new FakeVaultClient({}, new Set(['pivotal/jwskey/payerfsp']));

        const keys = await vaultSource(client).resolve(
            [participantKey({})],
            new Map([['payerfsp', 'PREVIOUS-PEM']]),
        );

        assert.equal(keys.get('payerfsp'), 'PREVIOUS-PEM');
        assert.equal(client.invalidated, 1);
    });

    it('should omit the tenant when Vault fails and nothing was previously loaded', async () => {
        const client = new FakeVaultClient({}, new Set(['pivotal/jwskey/payerfsp']));

        const keys = await vaultSource(client).resolve([participantKey({})], new Map());

        assert.equal(keys.size, 0);
    });

    it('should keep reading other tenants after one fails', async () => {
        const client = new FakeVaultClient(
            { 'pivotal/jwskey/payeefsp': 'PEM-B' },
            new Set(['pivotal/jwskey/payerfsp']),
        );

        const keys = await vaultSource(client).resolve(
            [participantKey({ fspId: 'payerfsp' }), participantKey({ fspId: 'payeefsp' })],
            new Map(),
        );

        assert.equal(keys.get('payeefsp'), 'PEM-B');
    });

    it('should honour a configured path prefix', async () => {
        const client = new FakeVaultClient({ 'custom/keys/payerfsp': 'PEM' });
        const settings = new VaultSettings('https://vault:8200', 'pivotal', 'kubernetes', 'kv', 'custom/keys');

        const keys = await new VaultJwsPrivateKeySource(client as never, settings)
            .resolve([participantKey({})], new Map());

        assert.equal(keys.get('payerfsp'), 'PEM');
    });
});
