export type ViewKey =
    | 'hub-add-currency'
    | 'hub-list-participants'
    | 'hub-add-signing-keys'
    | 'participant-onboarding'
    | 'participant-add-signing-keys'
    | 'participant-add-new-currency'
    | 'participant-register-endpoint'
    | 'transactions';

export type ViewGroup = 'Hub' | 'Participant' | 'Audit';

export type FieldType = 'text' | 'datetime' | 'select';
export type OrderDirection = 'ASC' | 'DESC';
export type PayloadKey = 'request' | 'response' | 'error';

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
}

export interface ColumnDefinition {
    key: string;
    label: string;
}

export interface ViewDefinition {
    key: ViewKey;
    group: ViewGroup;
    title: string;
    menuLabel: string;
    subtitle: string;
    endpoint: string;
    criteriaFields: FilterField[];
    orderColumns: SelectOption[];
    columns: ColumnDefinition[];
    primaryKey: string;
}

export interface ViewState {
    criteria: Record<string, string>;
    page: number;
    size: number;
    orderColumn: string;
    orderDirection: OrderDirection;
}

export interface QueryResponse {
    records: Record<string, unknown>[];
    totalRecords: number;
    pageRequest: {
        page: number;
        size: number;
    };
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
