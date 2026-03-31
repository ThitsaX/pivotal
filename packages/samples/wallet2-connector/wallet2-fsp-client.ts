import {Logger} from '@nestjs/common';
import {ConnectorSettings, FspClient} from '@core/connector/domain';
import {FspClientException} from '@core/connector/domain/exception/fsp-client-exception';
import {CatalystException, CatalystFeeEngine, FeeSplitRole} from '@shared/catalyst';
import {
    AmountType,
    ExtensionList,
    FspiopErrors,
    FspiopException,
    Money,
    Party,
    PartiesTypeIDPutResponse,
    PartyIdInfo,
    PartyIdType,
    TransactionScenario,
    TransferState,
    TransfersIDPutResponse,
} from '@shared/fspiop';

export class Wallet2FspClient extends FspClient {
    private readonly logger = new Logger(Wallet2FspClient.name);

    constructor(
        private readonly connectorSettings: ConnectorSettings,
        private readonly feeEngine: CatalystFeeEngine,
    ) {
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
        party.name = `Wallet2-${partyId}`;
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
        extensionList?: ExtensionList,
    ): Promise<FspClient.PostQuotesOutput> {
        this.logger.log(
            `postQuotes: scenario=${scenario}, subScenario=${subScenario ?? ''}, amountType=${amountType}, extensions=${extensionList?.extension?.length ?? 0}`,
        );

        if ((extensionList?.extension?.length ?? 0) > 0) {
            this.logger.debug(`postQuotes extensionList=${JSON.stringify(extensionList?.extension)}`);
        }

        const preCalculatedFees = new Map<FeeSplitRole, Money>();
        if (payerFspFee != null) {
            preCalculatedFees.set(FeeSplitRole.Payer, payerFspFee);
        }

        const scenarioName = subScenario ?? '';
        try {
            const fees = await this.feeEngine.execute(preCalculatedFees, scenarioName, amount, 0n);

            return new FspClient.PostQuotesOutput(amount, amount, fees);
        } catch (error) {
            if (error instanceof CatalystException) {
                throw new FspiopException(FspiopErrors.INTERNAL_SERVER_ERROR, error.message);
            }

            throw error;
        }
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
            ? TransferState.Reserved
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
        const minute = new Date().getMinutes();

        this.logger.log(`patchTransfers: transferId=${transferId}, transferState=${fulfilment}, minute=${minute}`);

        //if (minute % 2 === 1)
        {
            const description = `Simulated wallet2 PATCH failure for transfer ${transferId} because minute ${minute} is odd.`;

            this.logger.warn(description);

            throw new FspClientException(description);
        }
    }

}
