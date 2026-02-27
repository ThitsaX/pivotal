import { Money } from '../dto/money';
import { FspiopCurrencies } from '../component/fspiop-currencies';

export enum FspiopRoundingMode {
    Up = 'UP',
    Down = 'DOWN',
    Ceiling = 'CEILING',
    Floor = 'FLOOR',
    HalfUp = 'HALF_UP',
    HalfDown = 'HALF_DOWN',
    HalfEven = 'HALF_EVEN',
    Unnecessary = 'UNNECESSARY',
}

export class FspiopMoney {

    static readonly UINT64_MAX = BigInt('18446744073709551615');

    static deserialize(amount: bigint, scale: number): string {
        FspiopMoney.validateScale(scale);

        if (amount < 0n) {
            throw new Error('Amount must be greater than or equal to zero.');
        }

        const serializedAmount = amount.toString();

        if (scale === 0) {
            return serializedAmount;
        }

        if (serializedAmount.length <= scale) {
            const decimals = serializedAmount.padStart(scale, '0');
            return `0.${decimals}`;
        }

        const major = serializedAmount.slice(0, serializedAmount.length - scale);
        const minor = serializedAmount.slice(serializedAmount.length - scale);

        return `${major}.${minor}`;
    }

    static serialize(
        amount: string,
        scale: number,
        roundingMode: FspiopRoundingMode = FspiopRoundingMode.HalfUp,
    ): bigint {
        FspiopMoney.validateScale(scale);

        const normalizedAmount = amount.trim();
        const parsedAmount = FspiopMoney.parseDecimalAmount(normalizedAmount);
        const scaledAmount = FspiopMoney.scaleAmount(parsedAmount, scale, roundingMode);

        if (scaledAmount < 0n) {
            throw new Error('Amount must be greater than or equal to zero.');
        }

        if (scaledAmount > FspiopMoney.UINT64_MAX) {
            throw new Error('Amount is greater than uint64 max.');
        }

        return scaledAmount;
    }

    static validate(money: Money | null | undefined): void {
        if (money == null) {
            return;
        }

        const currencyProfile = FspiopCurrencies.get(money.currency);

        if (currencyProfile == null) {
            throw new Error(`Currency profile not found for currency: ${money.currency}`);
        }

        const submittedScale = FspiopMoney.scaleOf(money.amount);

        if (submittedScale > currencyProfile.scale) {
            throw new Error(
                `Currency scale does not match. ${money.currency} supports only ${currencyProfile.scale} decimal places.`,
            );
        }
    }

    private static validateScale(scale: number): void {
        if (!Number.isInteger(scale) || scale < 0) {
            throw new Error('Scale must be a non-negative integer.');
        }
    }

    private static scaleOf(amount: string): number {
        const dotIndex = amount.indexOf('.');

        if (dotIndex < 0) {
            return 0;
        }

        return amount.length - dotIndex - 1;
    }

    private static parseDecimalAmount(amount: string): {
        sign: 1n | -1n;
        integerPart: string;
        fractionPart: string;
    } {
        const matches = amount.match(/^([+-])?(\d+)(?:\.(\d+))?$/);

        if (matches == null) {
            throw new Error('Amount must be a valid decimal number.');
        }

        const sign = matches[1] === '-' ? -1n : 1n;
        const integerPart = matches[2];
        const fractionPart = matches[3] ?? '';

        return {
            sign,
            integerPart,
            fractionPart,
        };
    }

    private static scaleAmount(
        amount: {
            sign: 1n | -1n;
            integerPart: string;
            fractionPart: string;
        },
        scale: number,
        roundingMode: FspiopRoundingMode,
    ): bigint {
        const base = 10n ** BigInt(scale);
        const integerValue = BigInt(amount.integerPart) * base;
        const normalizedFraction = amount.fractionPart.padEnd(scale, '0');
        const keptFraction = normalizedFraction.slice(0, scale);
        const discardedFraction = amount.fractionPart.slice(scale);
        const keptFractionValue = keptFraction.length > 0 ? BigInt(keptFraction) : 0n;

        let scaled = integerValue + keptFractionValue;

        if (discardedFraction.length > 0) {
            const shouldRoundUp = FspiopMoney.shouldRoundUp(
                amount.sign,
                keptFraction,
                discardedFraction,
                roundingMode,
            );

            if (shouldRoundUp) {
                scaled += 1n;
            }
        }

        return scaled * amount.sign;
    }

    private static shouldRoundUp(
        sign: 1n | -1n,
        keptFraction: string,
        discardedFraction: string,
        roundingMode: FspiopRoundingMode,
    ): boolean {
        const hasDiscardedNonZero = /[1-9]/.test(discardedFraction);

        if (!hasDiscardedNonZero) {
            return false;
        }

        if (roundingMode === FspiopRoundingMode.Unnecessary) {
            throw new Error('Rounding is necessary for the submitted amount.');
        }

        if (roundingMode === FspiopRoundingMode.Up) {
            return true;
        }

        if (roundingMode === FspiopRoundingMode.Down) {
            return false;
        }

        if (roundingMode === FspiopRoundingMode.Ceiling) {
            return sign > 0n;
        }

        if (roundingMode === FspiopRoundingMode.Floor) {
            return sign < 0n;
        }

        const firstDiscardedDigit = Number.parseInt(discardedFraction[0], 10);
        const hasNonZeroTail = /[1-9]/.test(discardedFraction.slice(1));

        if (roundingMode === FspiopRoundingMode.HalfUp) {
            return firstDiscardedDigit >= 5;
        }

        if (roundingMode === FspiopRoundingMode.HalfDown) {
            return firstDiscardedDigit > 5 || (firstDiscardedDigit === 5 && hasNonZeroTail);
        }

        const lastKeptDigit = keptFraction.length > 0
            ? Number.parseInt(keptFraction[keptFraction.length - 1], 10)
            : 0;

        return (
            firstDiscardedDigit > 5 ||
            (firstDiscardedDigit === 5 && (hasNonZeroTail || lastKeptDigit % 2 !== 0))
        );
    }
}
