export const DATE_COLUMN_KEYS = new Set(['transactionStartAt', 'transactionCompletedAt']);
export const DESKTOP_BREAKPOINT = 1024;
export const PAGE_SIZE_OPTIONS = [50, 100, 200];
export const buildInitialState = (viewDefinitions) => {
    const entries = viewDefinitions.map((view) => {
        const criteria = Object.fromEntries(view.criteriaFields.map((field) => [field.key, '']));
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
    return Object.fromEntries(entries);
};
export const groupViews = (viewDefinitions) => {
    return ['Hub', 'Participant', 'Catalyst', 'Audit'].map((group) => {
        return {
            group: group,
            views: viewDefinitions.filter((view) => view.group === group),
        };
    });
};
export const getCriteriaSections = (fields) => {
    const sectionMap = new Map([
        ['status', { key: 'status', title: 'Status', fields: [] }],
        ['participant', { key: 'participant', title: 'Participant', fields: [] }],
        ['transaction', { key: 'transaction', title: 'Transaction', fields: [] }],
        ['parties', { key: 'parties', title: 'Parties', fields: [] }],
        ['transactionPeriod', { key: 'transactionPeriod', title: 'Transaction Period', fields: [] }],
    ]);
    for (const field of fields) {
        if (field.key === 'payerFsp' || field.key === 'payeeFsp') {
            sectionMap.get('participant')?.fields.push(field);
            continue;
        }
        if (field.key === 'transferId' || field.key === 'flow' || field.key === 'transferType' || field.key === 'subScenario') {
            sectionMap.get('transaction')?.fields.push(field);
            continue;
        }
        if (field.key.startsWith('transactionStartAt') || field.key.startsWith('transactionCompletedAt')) {
            sectionMap.get('transactionPeriod')?.fields.push(field);
            continue;
        }
        if (field.key === 'error' || field.key === 'dispute') {
            sectionMap.get('status')?.fields.push(field);
            continue;
        }
        sectionMap.get('parties')?.fields.push(field);
    }
    return Array.from(sectionMap.values()).filter((section) => section.fields.length > 0);
};
