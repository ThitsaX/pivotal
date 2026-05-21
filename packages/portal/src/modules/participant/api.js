import { apiClient, API_BASE_URL, ApiError } from '../../api/client';
export const PARTICIPANT_API_BASE_URL = API_BASE_URL;
function formatApiError(error) {
    if (error.code != null && error.code.length > 0) {
        if (error.message === error.code
            || error.message.startsWith(`${error.code}:`)
            || error.message.includes(`(${error.code})`)) {
            return new Error(error.message);
        }
        return new Error(`${error.code}: ${error.message}`);
    }
    return new Error(error.message);
}
export const executeParticipantAction = async (method, path, body) => {
    try {
        const payload = method === 'POST'
            ? await apiClient.post(path, body)
            : await apiClient.put(path, body);
        return { status: 200, payload };
    }
    catch (error) {
        if (error instanceof ApiError) {
            throw formatApiError(error);
        }
        throw error;
    }
};
export const fetchParticipantResource = async (path) => {
    try {
        return await apiClient.get(path);
    }
    catch (error) {
        if (error instanceof ApiError) {
            throw formatApiError(error);
        }
        throw error;
    }
};
