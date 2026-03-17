import type {
    CriteriaSection,
    FilterField,
    ViewDefinition,
    ViewGroup,
    ViewKey,
    ViewState,
} from './types';

export const DATE_COLUMN_KEYS = new Set(['createdAt', 'completedAt']);
export const DESKTOP_BREAKPOINT = 1024;
export const PAGE_SIZE_OPTIONS = [50, 100, 200] as const;

export const buildInitialState = (viewDefinitions: ViewDefinition[]): Record<ViewKey, ViewState> => {
    const entries = viewDefinitions.map((view: ViewDefinition): [ViewKey, ViewState] => {
        const criteria = Object.fromEntries(
            view.criteriaFields.map((field: FilterField): [string, string] => [field.key, '']),
        );

        return [
            view.key,
            {
                criteria,
                page: 0,
                size: 20,
                orderColumn: view.orderColumns[0]?.value ?? 'createdAt',
                orderDirection: 'DESC',
            },
        ];
    });

    return Object.fromEntries(entries) as Record<ViewKey, ViewState>;
};

export const groupViews = (viewDefinitions: ViewDefinition[]): Array<{group: ViewGroup; views: ViewDefinition[]}> => {
    return ['Participant', 'Outbound', 'Inbound'].map((group): {group: ViewGroup; views: ViewDefinition[]} => {
        return {
            group: group as ViewGroup,
            views: viewDefinitions.filter((view: ViewDefinition): boolean => view.group === group),
        };
    });
};

export const getCriteriaSections = (fields: FilterField[]): CriteriaSection[] => {
    const sectionMap = new Map<string, CriteriaSection>([
        ['participant', {key: 'participant', title: 'Participant', fields: []}],
        ['criteria', {key: 'criteria', title: 'Criteria', fields: []}],
        ['transactionPeriod', {key: 'transactionPeriod', title: 'Transaction Period', fields: []}],
        ['status', {key: 'status', title: 'Status', fields: []}],
    ]);

    for (const field of fields) {
        if (field.key === 'payerFsp' || field.key === 'payeeFsp') {
            sectionMap.get('participant')?.fields.push(field);
            continue;
        }

        if (field.key.startsWith('createdAt') || field.key.startsWith('completedAt')) {
            sectionMap.get('transactionPeriod')?.fields.push(field);
            continue;
        }

        if (field.key === 'error') {
            sectionMap.get('status')?.fields.push(field);
            continue;
        }

        sectionMap.get('criteria')?.fields.push(field);
    }

    return Array.from(sectionMap.values()).filter((section: CriteriaSection): boolean => section.fields.length > 0);
};
