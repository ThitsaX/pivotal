// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
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
