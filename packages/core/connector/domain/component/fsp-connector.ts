import {Inject, Injectable} from '@nestjs/common';
import {Interledger} from '@shared/interledger/component';
import {
    Currency,
    FspiopAgreement,
    FspiopCurrencies, FspiopDates,
    FspiopErrors,
    FspiopException,
    FspiopMoney,
    Money,
    PartiesTypeIDPutResponse,
    Party,
    PartyIdInfo,
    PartyIdType,
    QuotesIDPutResponse,
    QuotesPostRequest,
    TransfersIDPatchResponse,
    TransfersIDPutResponse,
    TransfersPostRequest,
    TransferState,
} from '@shared/fspiop';
import {ConnectorSettings} from './connector-settings';
import {FspConnectorValidation} from './fsp-connector-validation';
import {FspClient} from './fsp-client';

@Injectable()
export class FspConnector {

    private static readonly _15_MINUTES = 900;

    constructor(
        @Inject(FspClient)
        private readonly fspClient: FspClient,
        @Inject(ConnectorSettings)
        private readonly connectorSettings: ConnectorSettings,
    ) {
    }

    private static resolveLifetimeSeconds(expiration?: string): number {
        if (expiration == null) {
            return FspConnector._15_MINUTES;
        }

        const expiresAt = new Date(expiration).getTime();

        if (Number.isNaN(expiresAt)) {
            return FspConnector._15_MINUTES;
        }

        return Math.max(
            1,
            Math.floor((expiresAt - Date.now()) / 1000),
        );
    }

    private static toZeroMoney(currency: Currency): Money {

        const money = new Money();
        money.currency = currency;
        money.amount = '0';

        return money;
    }

    async getParties(
        partyIdType: PartyIdType,
        partyId: string,
        subId?: string | null,
    ): Promise<PartiesTypeIDPutResponse> {
        return this.fspClient.getParties(partyIdType, partyId, subId);
    }

    async postQuotes(postQuotesRequest: QuotesPostRequest): Promise<QuotesIDPutResponse> {

        FspConnectorValidation.validatePostQuotesRequest(postQuotesRequest, this.connectorSettings);

        const scenario = postQuotesRequest.transactionType?.scenario;

        if (scenario == null) {
            throw new FspiopException(
                FspiopErrors.MISSING_MANDATORY_ELEMENT,
                'postQuotesRequest.transactionType.scenario is required',
            );
        }

        const postQuotesOutput = await this.fspClient.postQuotes(
            scenario,
            postQuotesRequest.transactionType?.subScenario,
            postQuotesRequest.amountType,
            postQuotesRequest.amount,
            postQuotesRequest.fees,
        );

        FspConnectorValidation.validatePostQuotesOutput(postQuotesOutput, this.connectorSettings);

        const transferAmount = postQuotesOutput.transferAmount;
        const payeeReceiveAmount = postQuotesOutput.payeeReceiveAmount;
        const currencyProfile = FspiopCurrencies.get(transferAmount.currency);

        if (currencyProfile == null) {
            throw new FspiopException(
                FspiopErrors.PAYEE_UNSUPPORTED_CURRENCY,
                `Unsupported currency ${transferAmount.currency}`,
            );
        }

        const transferAmountMinor = FspiopMoney.serialize(transferAmount.amount, currencyProfile.scale);
        const expireAt = new Date(Date.now() + (FspConnector._15_MINUTES * 1000));
        const expiration = FspiopDates.forRequestBody(expireAt);
        const agreement = this.toAgreement(postQuotesRequest, transferAmount, payeeReceiveAmount, expireAt.getTime());

        const prepare = Interledger.prepare(
            this.connectorSettings.ilpSecret,
            Interledger.address(this.connectorSettings.connectorId),
            transferAmountMinor,
            JSON.stringify(agreement),
            expireAt.getTime(),
        );

        const response = new QuotesIDPutResponse();
        response.transferAmount = transferAmount;
        response.payeeReceiveAmount = payeeReceiveAmount;
        response.payeeFspFee = FspConnector.toZeroMoney(transferAmount.currency);
        response.payeeFspCommission = FspConnector.toZeroMoney(transferAmount.currency);
        response.expiration = expiration;
        response.ilpPacket = prepare.base64PreparePacket;
        response.condition = prepare.base64Condition;
        response.extensionList = postQuotesOutput.fees;

        return response;
    }

    async postTransfers(postTransferRequest: TransfersPostRequest): Promise<TransfersIDPutResponse> {

        FspConnectorValidation.validatePostTransfersRequest(postTransferRequest, this.connectorSettings);
        const ilpPrepare = FspConnectorValidation.validateAndUnwrapTransferIlpPacket(postTransferRequest);
        const transferFulfilment = this.fulfilTransfer(postTransferRequest, ilpPrepare);

        const payee = new Party();
        const payeePartyIdInfo = new PartyIdInfo();
        payeePartyIdInfo.fspId = postTransferRequest.payeeFsp;
        payee.partyIdInfo = payeePartyIdInfo;

        const response = await this.fspClient.postTransfers(
            postTransferRequest.transferId,
            postTransferRequest.amount,
            payee,
        );

        if (!transferFulfilment.valid) {
            response.transferState = TransferState.Aborted;
        }

        response.fulfilment = transferFulfilment.valid
            ? transferFulfilment.base64Fulfillment ?? undefined
            : undefined;

        return response;
    }

    async patchTransfers(patchresponse: FspConnector.PatchTransfersInput): Promise<void> {
        await this.fspClient.patchTransfers(
            new FspClient.PatchTransfersInput(
                patchresponse.payerFsp,
                patchresponse.payeeFsp,
                patchresponse.transferId,
                patchresponse.response,
            ),
        );
    }

    private fulfilTransfer(
        postTransferRequest: TransfersPostRequest,
        ilpPrepare: ReturnType<typeof Interledger.unwrap>,
    ): ReturnType<typeof Interledger.fulfil> {
        const lifetimeSeconds = FspConnector.resolveLifetimeSeconds(postTransferRequest.expiration);

        return Interledger.fulfil(
            this.connectorSettings.ilpSecret,
            ilpPrepare.destination,
            BigInt(ilpPrepare.amount),
            ilpPrepare.data.toString('utf-8'),
            postTransferRequest.condition,
            lifetimeSeconds,
        );
    }

    private toAgreement(
        postQuotesRequest: QuotesPostRequest,
        transferAmount: Money,
        payeeReceiveAmount: Money,
        expireAt: number,
    ): FspiopAgreement {

        const payer = postQuotesRequest.payer?.partyIdInfo;
        const payee = postQuotesRequest.payee?.partyIdInfo;
        const scenario = postQuotesRequest.transactionType?.scenario;

        if (payer == null || payee == null || scenario == null) {
            throw new FspiopException(
                FspiopErrors.MISSING_MANDATORY_ELEMENT,
                'payer.partyIdInfo, payee.partyIdInfo and transactionType.scenario are required',
            );
        }

        return new FspiopAgreement(
            postQuotesRequest.quoteId,
            payer,
            payee,
            postQuotesRequest.amountType,
            scenario,
            postQuotesRequest.transactionType?.subScenario,
            postQuotesRequest.amount,
            FspConnector.toZeroMoney(transferAmount.currency),
            FspConnector.toZeroMoney(transferAmount.currency),
            payeeReceiveAmount,
            transferAmount,
            expireAt,
        );
    }
}

export namespace FspConnector {

    export class PatchTransfersInput {
        constructor(
            public readonly payerFsp: string,
            public readonly payeeFsp: string,
            public readonly transferId: string,
            public readonly response: TransfersIDPatchResponse,
        ) {
        }
    }
}
