// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
export type ViewKey =
    | 'hub-add-currency'
    | 'hub-list-participants'
    | 'hub-add-signing-keys'
    | 'participant-onboarding'
    | 'participant-add-signing-keys'
    | 'participant-add-new-currency'
    | 'participant-register-endpoint'
    | 'transactions'
    | 'admin-users'
    | 'admin-roles'
    | 'admin-permissions';

export type FieldType = 'text' | 'datetime' | 'select';
export type OrderDirection = 'ASC' | 'DESC';
export type PayloadKey = 'request' | 'response' | 'error';

/** Keyset navigation sent to the backend. */
export type CursorDirection = 'first' | 'last' | 'next' | 'prev';

export interface SelectOption {
    label: string;
    value: string;
}

export interface FilterField {
    key: string;
    label: string;
    type: FieldType;
    placeholder?: string;
    options?: SelectOption[];
    disabled?: boolean;
}

export interface ColumnDefinition {
    key: string;
    label: string;
}

export interface ViewDefinition {
    key: ViewKey;
    title: string;
    subtitle: string;
    endpoint: string;
    criteriaFields: FilterField[];
    orderColumns: SelectOption[];
    columns: ColumnDefinition[];
    primaryKey: string;
}

export interface ViewState {
    criteria: Record<string, string>;
    size: number;
    orderColumn: string;
    orderDirection: OrderDirection;
}

export interface PageInfo {
    hasNext: boolean;
    hasPrev: boolean;
    startCursor?: string;
    endCursor?: string;
}

export interface QueryResponse {
    records: Record<string, unknown>[];
    pageInfo: PageInfo;
}

export interface CountResponse {
    count: number;
    capped: boolean;
    limit: number;
}

export interface SelectedPayload {
    title: string;
    value: unknown;
}

export interface DateTimeDisplayParts {
    date: string;
    time: string;
    zone: string;
}

export interface CriteriaSection {
    key: string;
    title: string;
    fields: FilterField[];
}
