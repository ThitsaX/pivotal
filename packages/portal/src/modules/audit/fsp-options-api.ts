import {apiClient} from '../../api/client';
import type {SelectOption} from './types';

export const fetchAuditFspOptions = async (): Promise<SelectOption[]> => {
    return apiClient.get<SelectOption[]>('/audit/fsp-options');
};
