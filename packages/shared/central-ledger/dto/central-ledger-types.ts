// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
export enum ParticipantFundsAction {
    RECORD_FUNDS_IN = 'recordFundsIn',
    RECORD_FUNDS_OUT_PREPARE_RESERVE = 'recordFundsOutPrepareReserve',
}

export enum RecordFundsOutAction {
    RECORD_FUNDS_OUT_COMMIT = 'recordFundsOutCommit',
    RECORD_FUNDS_OUT_ABORT = 'recordFundsOutAbort',
}

export enum SettlementModelGranularity {
    GROSS = 'GROSS',
    NET = 'NET',
}

export enum SettlementModelInterchange {
    BILATERAL = 'BILATERAL',
    MULTILATERAL = 'MULTILATERAL',
}

export enum SettlementModelDelay {
    DEFERRED = 'DEFERRED',
    IMMEDIATE = 'IMMEDIATE',
}

export enum SettlementModelLedgerAccountType {
    INTERCHANGE_FEE = 'INTERCHANGE_FEE',
    POSITION = 'POSITION',
}
