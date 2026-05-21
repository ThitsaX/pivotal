import { Currency } from '../../../../shared/fspiop/dto/currency';
export const DEFAULT_PARTICIPANT_CURRENCY = Currency.Mmk;
export const PARTICIPANT_CURRENCY_OPTIONS = Object.values(Currency)
    .slice()
    .sort((left, right) => left.localeCompare(right))
    .map((currency) => ({
    label: currency,
    value: currency,
}));
