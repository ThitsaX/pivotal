// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
export enum FeeFormulaRounding {
    HalfUp = 'HALF_UP',
    HalfDown = 'HALF_DOWN',
}

export enum FeeValueType {
    Fixed = 'FIXED',
    Percentage = 'PERCENTAGE',
}

export enum FeeSplitRole {
    Payer = 'PAYER_FSP',
    Payee = 'PAYEE_FSP',
    Hub = 'HUB',
    Si = 'SI',
    Fxp = 'FXP',
}
