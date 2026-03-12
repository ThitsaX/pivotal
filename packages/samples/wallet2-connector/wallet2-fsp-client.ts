import {Logger} from '@nestjs/common';
import {ConnectorSettings, FspClient} from '@core/connector/domain';
import {Interledger} from '@shared/interledger/component';
import {
    Currency,
    Extension,
    ExtensionList,
    FspiopAgreement,
    FspiopCurrencies,
    FspiopErrors,
    FspiopException,
    FspiopMoney,
    Money,
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
    private static readonly FEE_DENOMINATOR = 100n;
    private static readonly PAYER_FEE_SHARE = 30n;
    private static readonly PAYEE_FEE_SHARE = 30n;
    private static readonly SHARE_DENOMINATOR = 100n;

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
        const expiration = Wallet2FspClient.resolveQuoteExpiration(body.expiration);
        const lifetimeSeconds = Wallet2FspClient.resolveLifetimeSeconds(expiration);
        const agreement = Wallet2FspClient.toAgreement(body, expiration);

        const prepare = Interledger.prepare(
            this.connectorSettings.ilpSecret,
            Interledger.address(this.connectorSettings.connectorId),
            amount,
            JSON.stringify(agreement),
            lifetimeSeconds,
        );

        const feeExtensionList = Wallet2FspClient.toFeeExtensionList(
            amount,
            currencyProfile.scale,
            body.amount.currency,
        );

        const zeroMoney = Wallet2FspClient.toZeroMoney(body.amount.currency);

        const response = new QuotesIDPutResponse();
        response.transferAmount = body.amount;
        response.payeeReceiveAmount = body.amount;
        response.payeeFspFee = zeroMoney;
        response.payeeFspCommission = zeroMoney;
        response.expiration = agreement.expiration;
        response.ilpPacket = prepare.base64PreparePacket;
        response.condition = prepare.base64Condition;
        response.extensionList = feeExtensionList;

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

    private static resolveQuoteExpiration(expiration?: string): string {
        if (expiration == null) {
            return new Date(Date.now() + Wallet2FspClient.DEFAULT_PREPARE_LIFETIME_SECONDS * 1000).toISOString();
        }

        const expiresAt = new Date(expiration).getTime();
        if (Number.isNaN(expiresAt)) {
            return new Date(Date.now() + Wallet2FspClient.DEFAULT_PREPARE_LIFETIME_SECONDS * 1000).toISOString();
        }

        return expiration;
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

    private static toAgreement(body: QuotesPostRequest, expiration: string): FspiopAgreement {

        const payer = body.payer?.partyIdInfo;
        const payee = body.payee?.partyIdInfo;

        if (payer == null || payee == null) {
            throw new FspiopException(
                FspiopErrors.MISSING_MANDATORY_ELEMENT,
                'payer.partyIdInfo and payee.partyIdInfo are required',
            );
        }

        return new FspiopAgreement(
            body.quoteId,
            body.amount.currency,
            body.amount.amount,
            body.amount.amount,
            body.amount.amount,
            body.amountType,
            '0',
            '0',
            payer,
            payee,
            expiration,
        );
    }

    private static toFeeExtensionList(
        amount: bigint,
        scale: number,
        currency: Currency,
    ): ExtensionList {

        const totalFee = amount / Wallet2FspClient.FEE_DENOMINATOR;
        const payerFee = (totalFee * Wallet2FspClient.PAYER_FEE_SHARE) / Wallet2FspClient.SHARE_DENOMINATOR;
        const payeeFee = (totalFee * Wallet2FspClient.PAYEE_FEE_SHARE) / Wallet2FspClient.SHARE_DENOMINATOR;
        const hubFee = totalFee - payerFee - payeeFee;

        const extensionList = new ExtensionList();
        extensionList.extension = [
            Wallet2FspClient.toExtension('payer_fsp_fee', FspiopMoney.deserialize(payerFee, scale)),
            Wallet2FspClient.toExtension('payer_fsp_fee_cc', currency),
            Wallet2FspClient.toExtension('payee_fsp_fee', FspiopMoney.deserialize(payeeFee, scale)),
            Wallet2FspClient.toExtension('payee_fsp_fee_cc', currency),
            Wallet2FspClient.toExtension('hub_fee', FspiopMoney.deserialize(hubFee, scale)),
        ];

        return extensionList;
    }

    private static toExtension(key: string, value: string): Extension {

        const extension = new Extension();
        extension.key = key;
        extension.value = value;

        return extension;
    }

    private static toZeroMoney(currency: Currency): Money {

        const money = new Money();
        money.currency = currency;
        money.amount = '0';

        return money;
    }
}
