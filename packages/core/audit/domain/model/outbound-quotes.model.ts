export class OutboundQuotes {
    public readonly eventId: string;

    public readonly payload: unknown;

    public readonly createdAt: Date;

    constructor(eventId: string, payload: unknown, createdAt: Date = new Date()) {
        this.eventId = eventId;
        this.payload = payload;
        this.createdAt = createdAt;
    }
}
