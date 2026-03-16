import {
    FspiopErrors,
    FspiopException,
    FspiopHeaders,
    FspiopHeadersMap,
    FspiopMoney,
    FspiopSignature,
    Money,
    TransfersIDPutResponse,
    TransfersPostRequest,
} from '@shared/fspiop';

export class DoTransferCommand {
    constructor(public readonly input: DoTransferCommand.Input) {}
}

export namespace DoTransferCommand {

    export class Request {
        constructor(
            public readonly quoteId: string,
            public readonly payeeFsp: string,
            public readonly transferAmount: Money,
            public readonly ilpPacket: string,
            public readonly condition: string,
            public readonly expiration: string,
        ) {
        }
    }

    export class Input {
        public readonly destination: string;
        public readonly transferId: string;
        public readonly transferRequest: TransfersPostRequest;

        constructor(
            public readonly source: string,
            public readonly request: DoTransferCommand.Request,
        ) {
            this.destination = DoTransferCommand.Input.toDestination(this.request.payeeFsp);
            this.transferRequest = DoTransferCommand.Input.toTransfersPostRequest(this.source, this.request, this.destination);
            this.transferId = this.transferRequest.transferId;
        }

        private static toDestination(payeeFsp: string | undefined): string {
            const destination = payeeFsp?.trim();

            if (destination == null || destination.length === 0) {
                throw new FspiopException(
                    FspiopErrors.MISSING_MANDATORY_ELEMENT,
                    'payeeFsp is required',
                );
            }

            return destination;
        }

        private static toTransfersPostRequest(
            source: string,
            request: DoTransferCommand.Request,
            destination: string,
        ): TransfersPostRequest {
            const quoteId = request.quoteId?.trim();

            if (quoteId == null || quoteId.length === 0) {
                throw new FspiopException(
                    FspiopErrors.MISSING_MANDATORY_ELEMENT,
                    'quoteId is required',
                );
            }

            FspiopMoney.validate(request.transferAmount);

            const transferRequest = new TransfersPostRequest();
            transferRequest.transferId = quoteId;
            transferRequest.payeeFsp = destination;
            transferRequest.payerFsp = source;
            transferRequest.amount = request.transferAmount;
            transferRequest.ilpPacket = request.ilpPacket;
            transferRequest.condition = request.condition;
            transferRequest.expiration = request.expiration;

            return transferRequest;
        }
    }

    export class Response {
        constructor(public readonly response: TransfersIDPutResponse) {
        }
    }

    export class ConversionResponse {
        public readonly response: TransfersPostRequest;
        public readonly headers: FspiopHeadersMap;

        constructor(
            response: TransfersPostRequest,
            headers: FspiopHeadersMap,
        ) {
            this.response = response;
            this.headers = headers;
        }

        static fromInput(
            input: DoTransferCommand.Input,
            signer: DoTransferCommand.Signer,
        ): DoTransferCommand.ConversionResponse {
            const headers = FspiopHeaders.Values.Transfers.forRequest(input.source, input.destination);
            const signatureHeader = signer.sign(headers, JSON.stringify(input.transferRequest));

            if (signatureHeader != null) {
                headers[FspiopHeaders.Names.FSPIOP_SIGNATURE] = JSON.stringify(signatureHeader);
            }

            return new DoTransferCommand.ConversionResponse(
                input.transferRequest,
                headers,
            );
        }
    }

    export interface Signer {
        sign(headers: FspiopHeadersMap, payload: string): FspiopSignature.Header | undefined;
    }

    /**
     * Resolved once the PUT /transfers/{ID} callback arrives on the NATS
     * success subject via FspiopResponseSubscriber.
     * Throws FspiopException if the error callback arrives instead, or on timeout.
     */
    export class Output {
        constructor(
            public readonly response: DoTransferCommand.Response,
            public readonly callback: TransfersIDPutResponse,
        ) {
        }

        static fromCallback(callback: TransfersIDPutResponse): DoTransferCommand.Output {
            return new DoTransferCommand.Output(
                new DoTransferCommand.Response(callback),
                callback,
            );
        }
    }
}
