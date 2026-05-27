export const FSPIOP_AMOUNT_PATTERN = /^([0]|([1-9][0-9]{0,17}))([.][0-9]{0,3}[1-9])?$/;

export const normalizeFspiopAmount = (amount: string): string => amount.trim();
