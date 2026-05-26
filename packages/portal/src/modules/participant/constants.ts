import {Currency} from '../../../../shared/fspiop/dto/currency';

export const DEFAULT_PARTICIPANT_CURRENCY = Currency.Mmk;

export const PARTICIPANT_CURRENCY_OPTIONS = Object.values(Currency)
    .slice()
    .sort((left: string, right: string): number => left.localeCompare(right))
    .map((currency: string): {label: string; value: string} => ({
        label: currency,
        value: currency,
    }));
