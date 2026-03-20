export class FspiopDates {

    private static readonly REQUEST_BODY_GMT_OFFSET = '+00:00';

    static forRequestBody(date: Date = new Date()): string {
        return date.toISOString().replace('Z', FspiopDates.REQUEST_BODY_GMT_OFFSET);
    }

    static forRequestHeader(date: Date = new Date()): string {
        return date.toUTCString();
    }

    static fromRequestBody(body: string): Date {

        const parsed = new Date(body);

        if (Number.isNaN(parsed.getTime())) {
            throw new Error('Error parsing date from request body.');
        }

        return parsed;
    }

    static fromRequestHeader(header: string): Date {

        const parsed = new Date(header);

        if (Number.isNaN(parsed.getTime())) {
            throw new Error('Error parsing date from request header.');
        }

        return parsed;
    }
}
