import {Logger} from '@nestjs/common';
import {ConnectorSettings, FspClient} from '@core/connector/domain';
import {
    AmountType,
    FspiopCurrencies,
    FspiopMoney,
    Money,
    Party,
    PartiesTypeIDPutResponse,
    PartyIdInfo,
    PartyIdType,
    TransactionScenario,
    TransferState,
    TransfersIDPutResponse,
} from '@shared/fspiop';

export class Wallet1FspClient extends FspClient {

    private readonly logger = new Logger(Wallet1FspClient.name);
    private static readonly FEE_DENOMINATOR = 100n;
    private static readonly PAYER_FEE_SHARE = 30n;
    private static readonly PAYEE_FEE_SHARE = 30n;
    private static readonly SHARE_DENOMINATOR = 100n;

    constructor(private readonly connectorSettings: ConnectorSettings) {
        super();
    }

    async getParties(
        partyIdType: PartyIdType,
        partyId: string,
        subId?: string | null,
    ): Promise<PartiesTypeIDPutResponse> {
        this.logger.log(`getParties: partyIdType=${partyIdType}, partyId=${partyId}`);

        const partyIdInfo = new PartyIdInfo();
        partyIdInfo.partyIdType = partyIdType;
        partyIdInfo.partyIdentifier = partyId;
        partyIdInfo.partySubIdOrType = subId ?? undefined;
        partyIdInfo.fspId = this.connectorSettings.connectorId;

        const party = new Party();
        party.partyIdInfo = partyIdInfo;
        party.name = `Wallet1-${partyId}`;
        party.supportedCurrencies = this.connectorSettings.supportedCurrencies;

        const response = new PartiesTypeIDPutResponse();
        response.party = party;

        return response;
    }

    async postQuotes(
        scenario: TransactionScenario,
        subScenario: string | undefined,
        amountType: AmountType,
        amount: Money,
        payerFspFee?: Money,
    ): Promise<FspClient.PostQuotesOutput> {
        this.logger.log(
            `postQuotes: scenario=${scenario}, subScenario=${subScenario ?? ''}, amountType=${amountType}`,
        );

        const scale = FspiopCurrencies.get(amount.currency)!.scale;
        const amountMinor = FspiopMoney.serialize(
            amount.amount,
            scale,
        );
        const totalFee = amountMinor / Wallet1FspClient.FEE_DENOMINATOR;
        const payerFee = (totalFee * Wallet1FspClient.PAYER_FEE_SHARE) / Wallet1FspClient.SHARE_DENOMINATOR;
        const payeeFee = (totalFee * Wallet1FspClient.PAYEE_FEE_SHARE) / Wallet1FspClient.SHARE_DENOMINATOR;
        const hubFee = totalFee - payerFee - payeeFee;

        const fees = new Map<string, string>();
        fees.set('payer_fsp_fee', FspiopMoney.deserialize(payerFee, scale));
        fees.set('payer_fsp_fee_cc', FspiopMoney.deserialize(payerFee, scale));
        fees.set('payee_fsp_fee', FspiopMoney.deserialize(payeeFee, scale));
        fees.set('payee_fsp_fee_cc', FspiopMoney.deserialize(payeeFee, scale));
        fees.set('hub_fee', FspiopMoney.deserialize(hubFee, scale));

        return new FspClient.PostQuotesOutput(amount, amount, fees);
    }

    async postTransfers(
        transferId: string,
        transferAmount: Money,
        payee: Party,
    ): Promise<TransfersIDPutResponse> {
        const payeeFsp = payee.partyIdInfo?.fspId ?? '';

        this.logger.log(
            `postTransfers: transferId=${transferId}, payeeFsp=${payeeFsp}, amount=${transferAmount.amount} ${transferAmount.currency}`,
        );

        const transferState = payeeFsp === this.connectorSettings.connectorId
            ? TransferState.Committed
            : TransferState.Aborted;

        const response = new TransfersIDPutResponse();
        response.transferState = transferState;
        response.completedTimestamp = new Date().toISOString();
        response.extensionList = undefined;

        return response;
    }

    async patchTransfers(input: FspClient.PatchTransfersInput): Promise<void> {
        const {transferId, response} = input;
        const fulfilment = response.transferState;

        this.logger.log(`patchTransfers: transferId=${transferId}, transferState=${fulfilment}`);
    }
}
