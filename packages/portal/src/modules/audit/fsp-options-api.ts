import {apiClient} from '../../api/client';
import type {SelectOption} from './types';

export interface AuditFspOption extends SelectOption {
    description?: string;
}

export const fetchAuditFspOptions = async (): Promise<AuditFspOption[]> => {
    return apiClient.get<AuditFspOption[]>('/audit/fsp-options');
};
