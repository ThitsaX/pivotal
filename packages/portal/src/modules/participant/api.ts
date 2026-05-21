import {apiClient, API_BASE_URL, ApiError} from '../../api/client';

export const PARTICIPANT_API_BASE_URL = API_BASE_URL;

export interface ParticipantActionResult {
    status: number;
    payload: unknown;
}

export interface ParticipantAccountSummary {
    id: number;
    ledgerAccountType: string;
    currency?: string;
    isActive?: boolean;
    createdDate?: string | null;
    createdBy?: string | null;
}

export interface ParticipantSummary {
    name: string;
    id?: string;
    created?: string;
    isActive?: boolean;
    isProxy?: boolean;
    links?: {
        self?: string;
    };
    accounts?: ParticipantAccountSummary[];
}

function formatApiError(error: ApiError): Error {

    if (error.code != null && error.code.length > 0) {

        if (
            error.message === error.code
            || error.message.startsWith(`${error.code}:`)
            || error.message.includes(`(${error.code})`)
        ) {
            return new Error(error.message);
        }

        return new Error(`${error.code}: ${error.message}`);
    }

    return new Error(error.message);
}

export const executeParticipantAction = async (
    method: 'POST' | 'PUT',
    path: string,
    body: Record<string, unknown>,
): Promise<ParticipantActionResult> => {

    try {
        const payload = method === 'POST'
            ? await apiClient.post<unknown>(path, body)
            : await apiClient.put<unknown>(path, body);

        return {status: 200, payload};
    } catch (error) {
        if (error instanceof ApiError) {
            throw formatApiError(error);
        }
        throw error;
    }
};

export const fetchParticipantResource = async <T>(path: string): Promise<T> => {

    try {
        return await apiClient.get<T>(path);
    } catch (error) {
        if (error instanceof ApiError) {
            throw formatApiError(error);
        }
        throw error;
    }
};
