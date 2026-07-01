import * as assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {describe, it} from 'node:test';
import {PivotalException} from '../../../../../packages/shared/foundation/exception';
import {UpdateAccessKeyCommand, UpdateAccessKeyHandler} from '../../../../../packages/core/participant/domain/command';
import {Participant} from '../../../../../packages/core/participant/domain/model';
import {ParticipantRepository} from '../../../../../packages/core/participant/domain/repository';

interface State {
    participantsByName: Map<string, Participant>;
    saves:              Participant[];
}

function createPublicKeyPem(): string {
    const {publicKey} = generateKeyPairSync('rsa', {modulusLength: 2048});

    return String(publicKey.export({type: 'spki', format: 'pem'}));
}

function createPrivateKeyPem(): string {
    const {privateKey} = generateKeyPairSync('rsa', {modulusLength: 2048});

    return String(privateKey.export({type: 'pkcs8', format: 'pem'}));
}

function freshState(): State {
    return {
        participantsByName: new Map(),
        saves:              [],
    };
}

function addParticipant(state: State, name: string, accessPublicKey = createPublicKeyPem()): Participant {
    const participant = new Participant(name, null, null, accessPublicKey, `id-${name}`);
    state.participantsByName.set(name, participant);

    return participant;
}

function makeHandler(state: State): UpdateAccessKeyHandler {
    const repository = {
        async findByName(name: string): Promise<Participant | null> {
            return state.participantsByName.get(name) ?? null;
        },
        async save(participant: Participant): Promise<Participant> {
            state.saves.push(participant);
            state.participantsByName.set(participant.name, participant);

            return participant;
        },
    } as unknown as ParticipantRepository;

    return new UpdateAccessKeyHandler(repository);
}

describe('UpdateAccessKeyHandler', () => {

    it('replaces the access public key for a non-hub participant', async () => {

        const state = freshState();
        addParticipant(state, 'wallet1');
        const replacementKey = createPublicKeyPem();

        const output = await makeHandler(state).execute(new UpdateAccessKeyCommand(
            new UpdateAccessKeyCommand.Input('wallet1', replacementKey),
        ));

        assert.equal(output.participantId, 'id-wallet1');
        assert.equal(state.saves.length, 1);
        assert.equal(state.participantsByName.get('wallet1')!.accessPublicKey, replacementKey.trim());
    });

    it('rejects empty keys before saving', async () => {

        const state = freshState();
        addParticipant(state, 'wallet1');

        await assert.rejects(
            makeHandler(state).execute(new UpdateAccessKeyCommand(
                new UpdateAccessKeyCommand.Input('wallet1', '   '),
            )),
            (error: unknown) => error instanceof PivotalException
                && error.code === 'INVALID_ACCESS_PUBLIC_KEY',
        );

        assert.equal(state.saves.length, 0);
    });

    it('rejects non-public-key PEM before saving', async () => {

        const state = freshState();
        addParticipant(state, 'wallet1');

        await assert.rejects(
            makeHandler(state).execute(new UpdateAccessKeyCommand(
                new UpdateAccessKeyCommand.Input('wallet1', createPrivateKeyPem()),
            )),
            (error: unknown) => error instanceof PivotalException
                && error.code === 'INVALID_ACCESS_PUBLIC_KEY',
        );

        assert.equal(state.saves.length, 0);
    });

    it('rejects the hub participant before saving', async () => {

        const state = freshState();
        addParticipant(state, 'Hub');

        await assert.rejects(
            makeHandler(state).execute(new UpdateAccessKeyCommand(
                new UpdateAccessKeyCommand.Input('Hub', createPublicKeyPem()),
            )),
            (error: unknown) => error instanceof PivotalException
                && error.code === 'PARTICIPANT_ACCESS_KEY_UPDATE_FORBIDDEN',
        );

        assert.equal(state.saves.length, 0);
    });

    it('rejects missing participants', async () => {

        const state = freshState();

        await assert.rejects(
            makeHandler(state).execute(new UpdateAccessKeyCommand(
                new UpdateAccessKeyCommand.Input('missing', createPublicKeyPem()),
            )),
            (error: unknown) => error instanceof PivotalException
                && error.code === 'PARTICIPANT_NOT_FOUND',
        );

        assert.equal(state.saves.length, 0);
    });
});
