import {
    AmountType,
    Currency,
    ExtensionList,
    FspiopCurrencies,
    FspiopErrors,
    FspiopException,
    FspiopHeaders,
    FspiopMoney,
    FspiopSignature,
    Money,
    Party,
    PartyIdInfo,
    QuotesIDPutResponse,
    QuotesPostRequest,
    TransactionInitiator,
    TransactionInitiatorType,
    TransactionScenario,
    TransactionType,
} from '@shared/fspiop';
import {PrivateKeyStore} from '@shared/security/component/key';
import {Ulid} from '@shared/ulid';

export class DoQuotingCommand {
    constructor(public readonly input: DoQuotingCommand.Input) {}
}

export namespace DoQuotingCommand {

    export class Request {
        constructor(
            public readonly scenario: TransactionScenario,
            public readonly amountType: AmountType,
            public readonly amount: Money,
            public readonly payer: PartyIdInfo,
            public readonly payee: PartyIdInfo,
            public readonly subScenario?: string,
            public readonly payerFspFee?: Money,
        ) {
        }
    }

    export class Input {
        public readonly destination: string;
        public readonly quoteId: string;
        public readonly quoteRequest: QuotesPostRequest;

        constructor(
            public readonly source: string,
            public readonly request: DoQuotingCommand.Request,
        ) {
            this.destination = DoQuotingCommand.Input.toDestination(this.request.payee);
            this.quoteRequest = DoQuotingCommand.Input.toQuotesPostRequest(this.request);
            this.quoteId = this.quoteRequest.quoteId;
        }

        private static toDestination(payee: PartyIdInfo | undefined): string {
            const destination = payee?.fspId?.trim();

            if (destination == null || destination.length === 0) {
                throw new FspiopException(
                    FspiopErrors.MISSING_MANDATORY_ELEMENT,
                    'payee.fspId is required to resolve destination FSP',
                );
            }

            return destination;
        }

        private static toQuotesPostRequest(request: DoQuotingCommand.Request): QuotesPostRequest {

            const quoteRequest = new QuotesPostRequest();

            FspiopMoney.validate(request.amount);
            FspiopMoney.validate(request.payerFspFee);

            const quoteId = Ulid.generate();

            quoteRequest.quoteId = quoteId;
            quoteRequest.transactionId = quoteId;
            quoteRequest.amountType = request.amountType;
            quoteRequest.amount = request.amount;
            quoteRequest.payer = DoQuotingCommand.Input.toParty(request.payer);
            quoteRequest.payee = DoQuotingCommand.Input.toParty(request.payee);
            quoteRequest.fees = request.payerFspFee;
            quoteRequest.transactionType = DoQuotingCommand.Input.toTransactionType(request.scenario, request.subScenario);

            return quoteRequest;
        }

        private static toParty(partyIdInfo: PartyIdInfo | undefined): Party {

            if (partyIdInfo == null) {
                throw new FspiopException(
                    FspiopErrors.MISSING_MANDATORY_ELEMENT,
                    'payer and payee are required',
                );
            }

            const party = new Party();
            party.partyIdInfo = partyIdInfo;

            return party;
        }

        private static toTransactionType(
            scenario: TransactionScenario | undefined,
            subScenario: string | undefined,
        ): TransactionType {

            if (scenario == null) {
                throw new FspiopException(
                    FspiopErrors.MISSING_MANDATORY_ELEMENT,
                    'transactionType is required',
                );
            }

            const transactionType = new TransactionType();
            transactionType.scenario = scenario;
            transactionType.initiator = TransactionInitiator.Payer;
            transactionType.initiatorType = TransactionInitiatorType.Consumer;

            const normalizedSubScenario = subScenario?.trim();

            if (normalizedSubScenario != null && normalizedSubScenario.length > 0) {
                transactionType.subScenario = normalizedSubScenario;
            }

            return transactionType;
        }
    }

    export class Response {
        private static readonly SCHEME_FEE_AMOUNT_KEY = 'scheme_fee_amount';
        private static readonly FEE_CURRENCY_KEY = 'fee_currency';

        constructor(
            public readonly quoteId: string,
            public readonly transferAmount: Money,
            public readonly payeeReceiveAmount: Money,
            public readonly schemeFeeAmount: Money,
            public readonly ilpPacket: string,
            public readonly condition: string,
            public readonly expiration: string,
            public readonly extensionList: ExtensionList,
        ) {
        }

        static fromCallback(quoteId: string, callback: QuotesIDPutResponse): DoQuotingCommand.Response {
            const transferAmount = callback.transferAmount;

            if (transferAmount == null) {
                throw new FspiopException(
                    FspiopErrors.MISSING_MANDATORY_ELEMENT,
                    'transferAmount is required',
                );
            }

            const currencyProfile = FspiopCurrencies.get(transferAmount.currency);

            if (currencyProfile == null) {
                throw new FspiopException(
                    FspiopErrors.PAYEE_UNSUPPORTED_CURRENCY,
                    `Unsupported currency ${transferAmount.currency}`,
                );
            }

            const extensionList = DoQuotingCommand.Response.toExtensionList(callback.extensionList);
            const schemeFeeAmount = DoQuotingCommand.Response.toSchemeFeeAmount(
                extensionList,
                transferAmount.currency,
                currencyProfile.scale,
            );
            const payeeReceiveAmount = callback.payeeReceiveAmount ?? transferAmount;

            return new DoQuotingCommand.Response(
                quoteId,
                transferAmount,
                payeeReceiveAmount,
                schemeFeeAmount,
                callback.ilpPacket,
                callback.condition,
                callback.expiration,
                extensionList,
            );
        }

        private static toExtensionList(extensionList: ExtensionList | undefined): ExtensionList {

            const normalizedExtensionList = new ExtensionList();
            normalizedExtensionList.extension = extensionList?.extension ?? [];

            return normalizedExtensionList;
        }

        private static toSchemeFeeAmount(
            extensionList: ExtensionList,
            fallbackCurrency: Currency,
            fallbackScale: number,
        ): Money {
            const schemeFeeAmount = DoQuotingCommand.Response.findExtensionValue(
                extensionList,
                DoQuotingCommand.Response.SCHEME_FEE_AMOUNT_KEY,
            ) ?? '0';
            const feeCurrencyValue = DoQuotingCommand.Response.findExtensionValue(
                extensionList,
                DoQuotingCommand.Response.FEE_CURRENCY_KEY,
            );
            const feeCurrency = feeCurrencyValue as Currency | undefined;
            const feeCurrencyScale = feeCurrency == null
                ? undefined
                : FspiopCurrencies.get(feeCurrency)?.scale;
            const currency = feeCurrencyScale == null || feeCurrency == null
                ? fallbackCurrency
                : feeCurrency;
            const scale = feeCurrencyScale == null
                ? fallbackScale
                : feeCurrencyScale;
            const serializedSchemeFeeAmount = FspiopMoney.serialize(schemeFeeAmount, scale);

            return DoQuotingCommand.Response.toMoney(currency, FspiopMoney.deserialize(serializedSchemeFeeAmount, scale));
        }

        private static findExtensionValue(extensionList: ExtensionList, targetKey: string): string | undefined {
            const normalizedTargetKey = targetKey.trim().toLowerCase();

            for (const extension of extensionList.extension) {
                const key = extension.key?.trim().toLowerCase() ?? '';

                if (key !== normalizedTargetKey) {
                    continue;
                }

                return extension.value?.trim();
            }

            return undefined;
        }

        private static toMoney(currency: Currency, amount: string): Money {

            const money = new Money();
            money.currency = currency;
            money.amount = amount;

            return money;
        }
    }

    export class ConversionResponse {
        public readonly quoteRequest: QuotesPostRequest;
        public readonly fspiopSignature: string;
        public readonly ['fspiop-signature']: string;

        constructor(
            quoteRequest: QuotesPostRequest,
            fspiopSignature: string,
        ) {
            this.quoteRequest = quoteRequest;
            this.fspiopSignature = fspiopSignature;
            this['fspiop-signature'] = fspiopSignature;
        }

        static fromInput(
            input: DoQuotingCommand.Input,
            privateKeyStore: PrivateKeyStore,
        ): DoQuotingCommand.ConversionResponse {
            const privateKey = privateKeyStore.get(input.source);

            if (privateKey == null) {
                throw new FspiopException(
                    FspiopErrors.MISSING_MANDATORY_ELEMENT,
                    `Private key is required to generate fspiop-signature for source "${input.source}".`,
                );
            }

            const headers = FspiopHeaders.Values.Quotes.forRequest(input.source, input.destination);
            const signatureHeader = FspiopSignature.sign(
                privateKey,
                headers,
                JSON.stringify(input.quoteRequest),
            );

            return new DoQuotingCommand.ConversionResponse(
                input.quoteRequest,
                JSON.stringify(signatureHeader),
            );
        }
    }

    /**
     * Resolved once the PUT /quotes/{ID} callback arrives on the NATS
     * success subject via FspiopResponseSubscriber.
     * Throws FspiopException if the error callback arrives instead, or on timeout.
     */
    export class Output {
        constructor(
            public readonly response: DoQuotingCommand.Response,
            public readonly callback: QuotesIDPutResponse,
        ) {
        }

        static fromCallback(
            input: DoQuotingCommand.Input,
            callback: QuotesIDPutResponse,
        ): DoQuotingCommand.Output {
            return new DoQuotingCommand.Output(
                DoQuotingCommand.Response.fromCallback(input.quoteId, callback),
                callback,
            );
        }
    }
}
