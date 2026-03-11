import {Logger} from '@nestjs/common';
import {ConnectorSettings, FspClient} from '@core/connector/domain';
import {Interledger} from '@shared/interledger/component';
import {
    FspiopCurrencies,
    FspiopErrors,
    FspiopException,
    FspiopMoney,
    Party,
    PartiesTypeIDPutResponse,
    PartyIdInfo,
    QuotesIDPutResponse,
    QuotesPostRequest,
    TransferState,
    TransfersIDPutResponse,
    TransfersPostRequest,
} from '@shared/fspiop';

export class Wallet2FspClient extends FspClient {

    private readonly logger = new Logger(Wallet2FspClient.name);
    private static readonly DEFAULT_PREPARE_LIFETIME_SECONDS = 30;

    constructor(private readonly connectorSettings: ConnectorSettings) {
        super();
    }

    async getParties(input: FspClient.GetPartiesInput): Promise<PartiesTypeIDPutResponse> {
        this.logger.log(`getParties: partyIdType=${input.partyIdType}, partyId=${input.partyId}`);

        const partyIdInfo = new PartyIdInfo();
        partyIdInfo.partyIdType = input.partyIdType;
        partyIdInfo.partyIdentifier = input.partyId;
        partyIdInfo.partySubIdOrType = input.subId ?? undefined;
        partyIdInfo.fspId = input.payeeFsp;

        const party = new Party();
        party.partyIdInfo = partyIdInfo;
        party.name = `Wallet2-${input.partyId}`;
        party.supportedCurrencies = this.connectorSettings.supportedCurrencies;

        const response = new PartiesTypeIDPutResponse();
        response.party = party;

        return response;
    }

    async postQuotes(body: QuotesPostRequest): Promise<QuotesIDPutResponse> {
        this.logger.log(`postQuotes: quoteId=${body.quoteId}`);

        const currencyProfile = FspiopCurrencies.get(body.amount.currency);
        if (currencyProfile == null) {
            throw new FspiopException(
                FspiopErrors.PAYEE_UNSUPPORTED_CURRENCY,
                `Wallet2FspClient.postQuotes: unsupported currency ${body.amount.currency}`,
            );
        }

        const amount = FspiopMoney.serialize(body.amount.amount, currencyProfile.scale);
        const lifetimeSeconds = Wallet2FspClient.resolveLifetimeSeconds(body.expiration);

        const prepare = Interledger.prepare(
            this.connectorSettings.ilpSecret,
            Interledger.address(this.connectorSettings.connectorId),
            amount,
            body.quoteId,
            lifetimeSeconds,
        );

        const response = new QuotesIDPutResponse();
        response.transferAmount = body.amount;
        response.payeeReceiveAmount = body.amount;
        response.payeeFspFee = body.fees;
        response.payeeFspCommission = body.fees;
        response.expiration = body.expiration ?? new Date(Date.now() + lifetimeSeconds * 1000).toISOString();
        response.ilpPacket = prepare.base64PreparePacket;
        response.condition = prepare.base64Condition;
        response.extensionList = body.extensionList;

        return response;
    }

    async postTransfers(body: TransfersPostRequest): Promise<TransfersIDPutResponse> {
        this.logger.log(`postTransfers: transferId=${body.transferId}`);

        const prepare = Interledger.unwrap(body.ilpPacket);
        const lifetimeSeconds = Wallet2FspClient.resolveLifetimeSeconds(body.expiration);

        const fulfilment = Interledger.fulfil(
            this.connectorSettings.ilpSecret,
            prepare.destination,
            BigInt(prepare.amount),
            prepare.data.toString('utf-8'),
            body.condition,
            lifetimeSeconds,
        );

        const response = new TransfersIDPutResponse();
        response.transferState = fulfilment.valid
            ? TransferState.Committed
            : TransferState.Aborted;
        response.fulfilment = fulfilment.base64Fulfillment ?? undefined;
        response.completedTimestamp = new Date().toISOString();
        response.extensionList = body.extensionList;

        return response;
    }

    async patchTransfers(input: FspClient.PatchTransfersInput): Promise<void> {
        const {transferId, response} = input;
        const fulfilment = response.transferState;

        this.logger.log(`patchTransfers: transferId=${transferId}, transferState=${fulfilment}`);
    }

    private static resolveLifetimeSeconds(expiration?: string): number {
        if (expiration == null) {
            return Wallet2FspClient.DEFAULT_PREPARE_LIFETIME_SECONDS;
        }

        const expiresAt = new Date(expiration).getTime();
        if (Number.isNaN(expiresAt)) {
            return Wallet2FspClient.DEFAULT_PREPARE_LIFETIME_SECONDS;
        }

        return Math.max(
            1,
            Math.floor((expiresAt - Date.now()) / 1000),
        );
    }
}
