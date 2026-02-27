import { FspiopDates } from './fspiop-dates';

export type FspiopHeadersMap = Record<string, string>;

function createHeaders(
    accept: string | null,
    contentType: string,
    source: string,
    destination?: string | null,
): FspiopHeadersMap {

    const headers: FspiopHeadersMap = {};

    if (accept != null) {
        headers[FspiopHeaders.Names.ACCEPT] = accept;
    }

    headers[FspiopHeaders.Names.CONTENT_TYPE] = contentType;
    headers[FspiopHeaders.Names.DATE] = FspiopDates.forRequestHeader();
    headers[FspiopHeaders.Names.FSPIOP_SOURCE] = source;

    if (destination != null) {
        headers[FspiopHeaders.Names.FSPIOP_DESTINATION] = destination;
    }

    return headers;
}

export class FspiopHeaders {
}

export namespace FspiopHeaders {

    export class Names {

        static readonly ACCEPT = 'accept';

        static readonly CONTENT_TYPE = 'content-type';

        static readonly DATE = 'date';

        static readonly FSPIOP_SOURCE = 'fspiop-source';

        static readonly FSPIOP_DESTINATION = 'fspiop-destination';

        static readonly FSPIOP_HTTP_METHOD = 'fspiop-http-method';

        static readonly FSPIOP_SIGNATURE = 'fspiop-signature';

        static readonly FSPIOP_ENCRYPTION = 'fspiop-encryption';

        static readonly FSPIOP_URI = 'fspiop-uri';
    }

    export namespace Values {

        export class Parties {

            static readonly ACCEPT = 'application/vnd.interoperability.parties+json;version=2.0';

            static readonly CONTENT_TYPE = 'application/vnd.interoperability.parties+json;version=2.0';

            static forRequest(source: string, destination?: string | null): FspiopHeadersMap {
                return createHeaders(Parties.ACCEPT, Parties.CONTENT_TYPE, source, destination);
            }

            static forResult(source: string, destination?: string | null): FspiopHeadersMap {
                return createHeaders(null, Parties.CONTENT_TYPE, source, destination);
            }
        }

        export class Quotes {

            static readonly ACCEPT = 'application/vnd.interoperability.quotes+json;version=2.0';

            static readonly CONTENT_TYPE = 'application/vnd.interoperability.quotes+json;version=2.0';

            static forRequest(source: string, destination?: string | null): FspiopHeadersMap {
                return createHeaders(Quotes.ACCEPT, Quotes.CONTENT_TYPE, source, destination);
            }

            static forResult(source: string, destination?: string | null): FspiopHeadersMap {
                return createHeaders(null, Quotes.CONTENT_TYPE, source, destination);
            }
        }

        export class Transfers {

            static readonly ACCEPT = 'application/vnd.interoperability.transfers+json;version=2.0';

            static readonly CONTENT_TYPE = 'application/vnd.interoperability.transfers+json;version=2.0';

            static forRequest(source: string, destination?: string | null): FspiopHeadersMap {
                return createHeaders(Transfers.ACCEPT, Transfers.CONTENT_TYPE, source, destination);
            }

            static forResult(source: string, destination?: string | null): FspiopHeadersMap {
                return createHeaders(null, Transfers.CONTENT_TYPE, source, destination);
            }
        }

        export class Participants {

            static readonly ACCEPT = 'application/vnd.interoperability.participants+json;version=2.0';

            static readonly CONTENT_TYPE = 'application/vnd.interoperability.participants+json;version=2.0';

            static forRequest(source: string, destination?: string | null): FspiopHeadersMap {
                return createHeaders(Participants.ACCEPT, Participants.CONTENT_TYPE, source, destination);
            }

            static forResult(source: string, destination?: string | null): FspiopHeadersMap {
                return createHeaders(Participants.ACCEPT, Participants.CONTENT_TYPE, source, destination);
            }
        }
    }
}
