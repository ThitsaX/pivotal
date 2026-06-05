import { FspiopErrors, FspiopException, FspiopMoney, Money } from '@shared/fspiop';

export class AmountDecimalValidator {

    constructor(private readonly allowedDecimalPlaces: number) {
    }

    validate(amount: string | Money | null | undefined): void {
        const amountValue = typeof amount === 'string'
            ? amount
            : amount?.amount;

        if (amountValue == null || amountValue.trim().length === 0) {
            return;
        }

        // Normalize first so trailing zeros are not counted as decimals (e.g. 128.00 -> 128).
        const normalized = FspiopMoney.normalizeAmount(amountValue);

        if (AmountDecimalValidator.decimalPlaces(normalized) > this.allowedDecimalPlaces) {
            throw new FspiopException(
                FspiopErrors.ROUNDING_VALUE_ERROR,
            );
        }
    }

    private static decimalPlaces(amount: string): number {
        const decimalIndex = amount.indexOf('.');

        return decimalIndex < 0 ? 0 : amount.length - decimalIndex - 1;
    }
}
