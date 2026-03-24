const DEFAULT_WEB_PIVOTAL_API_BASE_URL = `${window.location.protocol}//${window.location.hostname}:3202`;

export const PARTICIPANT_API_BASE_URL = (
    import.meta.env.VITE_WEB_PIVOTAL_API_BASE_URL ??
    import.meta.env.VITE_AUDIT_API_BASE_URL ??
    DEFAULT_WEB_PIVOTAL_API_BASE_URL
).replace(/\/$/, '');

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

interface ErrorPayload {
    code?: string;
    message?: string;
}

const toErrorPayload = (value: unknown): ErrorPayload | null => {
    if (value == null || typeof value !== 'object') {
        return null;
    }

    return value as ErrorPayload;
};

const toErrorMessage = (status: number, payload: unknown, fallbackStatusText: string): string => {
    const errorPayload = toErrorPayload(payload);
    const code = errorPayload?.code?.trim();
    const message = errorPayload?.message?.trim();

    if (code != null && code.length > 0 && message != null && message.length > 0) {
        if (
            message === code
            || message.startsWith(`${code}:`)
            || message.includes(`(${code})`)
        ) {
            return message;
        }

        return `${code}: ${message}`;
    }

    if (message != null && message.length > 0) {
        return message;
    }

    if (code != null && code.length > 0) {
        return code;
    }

    return `${status} ${fallbackStatusText}`.trim();
};

const parseResponseBody = async (response: Response): Promise<unknown> => {
    const contentType = response.headers.get('content-type') ?? '';

    if (contentType.includes('application/json')) {
        return response.json();
    }

    const text = await response.text();

    if (text.trim().length === 0) {
        return null;
    }

    return text;
};

export const executeParticipantAction = async (
    method: 'POST' | 'PUT',
    path: string,
    body: Record<string, unknown>,
): Promise<ParticipantActionResult> => {
    const response = await fetch(`${PARTICIPANT_API_BASE_URL}${path}`, {
        method,
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    const payload = await parseResponseBody(response);

    if (!response.ok) {
        throw new Error(toErrorMessage(response.status, payload, response.statusText));
    }

    return {
        status: response.status,
        payload,
    };
};

export const fetchParticipantResource = async <T>(path: string): Promise<T> => {
    const response = await fetch(`${PARTICIPANT_API_BASE_URL}${path}`, {
        method: 'GET',
        headers: {
            Accept: 'application/json',
        },
    });

    const payload = await parseResponseBody(response);

    if (!response.ok) {
        throw new Error(toErrorMessage(response.status, payload, response.statusText));
    }

    return payload as T;
};
