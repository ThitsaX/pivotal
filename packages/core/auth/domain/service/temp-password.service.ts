// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {randomInt} from 'node:crypto';
import {Injectable} from '@nestjs/common';

@Injectable()
export class TempPasswordService {

    private static readonly LOWER  = 'abcdefghijkmnopqrstuvwxyz';

    private static readonly UPPER  = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

    private static readonly DIGITS = '23456789';

    private static readonly SYMBOL = '!@#$%^&*?_-+=';

    private static readonly DEFAULT_LENGTH = 16;

    generate(length: number = TempPasswordService.DEFAULT_LENGTH): string {

        if (length < 12) {
            throw new Error(`Temp password length must be at least 12 (NFR-9); got ${length}.`);
        }

        const all = TempPasswordService.LOWER
            + TempPasswordService.UPPER
            + TempPasswordService.DIGITS
            + TempPasswordService.SYMBOL;

        const chars: string[] = [
            TempPasswordService.pick(TempPasswordService.LOWER),
            TempPasswordService.pick(TempPasswordService.UPPER),
            TempPasswordService.pick(TempPasswordService.DIGITS),
            TempPasswordService.pick(TempPasswordService.SYMBOL),
        ];

        while (chars.length < length) {
            chars.push(TempPasswordService.pick(all));
        }

        // Fisher-Yates shuffle so the guaranteed-class chars aren't predictable in position.
        for (let i = chars.length - 1; i > 0; i -= 1) {
            const j = randomInt(0, i + 1);
            [chars[i], chars[j]] = [chars[j], chars[i]];
        }

        return chars.join('');
    }

    private static pick(charset: string): string {
        return charset[randomInt(0, charset.length)];
    }
}
