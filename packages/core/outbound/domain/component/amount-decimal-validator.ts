import { FspiopErrors, FspiopException, Money } from '@shared/fspiop';

export class AmountDecimalValidator {

   private static readonly ENV_SEND_MONEY_AMOUNT_DECIMAL_PLACES = 'DECIMAL_PLACES';
   static validate(amount: string | Money | null | undefined): void {
      const amountValue = typeof amount === 'string'
         ? amount
         : amount?.amount;

      if (amountValue == null || amountValue.trim().length === 0) {
         return;
      }

      const allowedDecimalPlaces = AmountDecimalValidator.allowedDecimalPlaces();
      const actualDecimalPlaces = AmountDecimalValidator.decimalPlaces(amountValue);

      if (actualDecimalPlaces > allowedDecimalPlaces) {
         throw new FspiopException(
            FspiopErrors.ROUNDING_VALUE_ERROR
         );
      }
   }

   private static allowedDecimalPlaces(): number {
      const rawValue = process.env[AmountDecimalValidator.ENV_SEND_MONEY_AMOUNT_DECIMAL_PLACES] ?? '0';
      const value = Number.parseInt(rawValue, 10);

      return Number.isInteger(value) && value >= 0 ? value : 0;
   }

   private static decimalPlaces(amount: string): number {
      const decimalIndex = amount.indexOf('.');

      return decimalIndex < 0 ? 0 : amount.length - decimalIndex - 1;
   }
}