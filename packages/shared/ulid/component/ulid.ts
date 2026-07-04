// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {randomBytes} from 'node:crypto';

export class Ulid {

    private static readonly ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

    private static readonly TIME_PART_LENGTH = 10;

    private static readonly RANDOM_PART_LENGTH = 16;

    private static readonly RANDOM_BYTES_LENGTH = 10;

    private static readonly MASK = 31n;

    private static readonly SHIFT = 5n;

    private static readonly MAX_TIMESTAMP = (1n << 48n) - 1n;

    private constructor() {
    }

    public static generate(): string {

        const timestamp = BigInt(Date.now());

        if (timestamp > Ulid.MAX_TIMESTAMP) {
            throw new Error('ULID timestamp overflow.');
        }

        const timePart = Ulid.toBase32(timestamp, Ulid.TIME_PART_LENGTH);
        const randomPart = Ulid.toBase32(Ulid.randomValue(), Ulid.RANDOM_PART_LENGTH);

        return `${timePart}${randomPart}`;
    }

    private static randomValue(): bigint {

        const random = randomBytes(Ulid.RANDOM_BYTES_LENGTH);
        let value = 0n;

        for (const byte of random.values()) {
            value = (value << 8n) | BigInt(byte);
        }

        return value;
    }

    private static toBase32(value: bigint, count: number): string {

        const buffer = new Array<string>(count);
        let remaining = value;

        for (let i = count - 1; i >= 0; i -= 1) {
            const alphabetIndex = Number(remaining & Ulid.MASK);
            buffer[i] = Ulid.ALPHABET.charAt(alphabetIndex);
            remaining >>= Ulid.SHIFT;
        }

        return buffer.join('');
    }
}
