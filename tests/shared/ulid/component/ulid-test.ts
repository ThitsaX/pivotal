import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {Ulid} from '../../../../packages/shared/ulid/component/ulid';

const ULID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const TIME_PART_LENGTH = 10;
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ALPHABET_INDEX = new Map(
    ALPHABET
        .split('')
        .map((character, index) => [character, index] as const),
);

function decodeTime(timePart: string): number {

    let value = 0;

    for (const character of timePart.split('')) {
        const decoded = ALPHABET_INDEX.get(character);

        if (decoded == null) {
            throw new Error(`Invalid ULID character: ${character}`);
        }

        value = (value * 32) + decoded;
    }

    return value;
}

describe('Ulid', () => {

    it('should generate a ULID compatible value', () => {
        const ulid = Ulid.generate();

        assert.equal(ulid.length, 26);
        assert.equal(ULID_REGEX.test(ulid), true);
    });

    it('should encode current timestamp into first 10 characters', () => {

        const before = Date.now();
        const ulid = Ulid.generate();
        const after = Date.now();
        const encodedTimestamp = decodeTime(ulid.slice(0, TIME_PART_LENGTH));

        assert.equal(encodedTimestamp >= before, true);
        assert.equal(encodedTimestamp <= after, true);
    });

    it('should produce unique values under load', () => {
        const total = 50_000;
        const ulids = new Set<string>();

        for (let i = 0; i < total; i += 1) {
            ulids.add(Ulid.generate());
        }

        assert.equal(ulids.size, total);
    });
});
