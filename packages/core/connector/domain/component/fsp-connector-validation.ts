import {Interledger} from '@shared/interledger/component';
import {
    FspiopCurrencies,
    FspiopErrors,
    FspiopException,
    FspiopMoney,
    QuotesPostRequest,
    TransfersPostRequest,
} from '@shared/fspiop';
import {ConnectorSettings} from './connector-settings';
import {FspClient} from './fsp-client';

export class FspConnectorValidation {

    private constructor() {
    }

    static validatePostQuotesRequest(
        postQuotesRequest: QuotesPostRequest,
        connectorSettings: ConnectorSettings,
    ): void {
        const currency = postQuotesRequest.amount?.currency;

        if (currency == null) {
            throw new FspiopException(
                FspiopErrors.MISSING_MANDATORY_ELEMENT,
                'postQuotesRequest.amount.currency is required',
            );
        }

        if (!connectorSettings.isCurrencySupported(currency)) {
            throw new FspiopException(
                FspiopErrors.PAYEE_UNSUPPORTED_CURRENCY,
                `Currency ${currency} is not supported by connector ${connectorSettings.connectorId}`,
            );
        }

        FspiopMoney.validate(postQuotesRequest.amount);
        FspiopMoney.validate(postQuotesRequest.fees);
    }

    static validatePostQuotesOutput(
        postQuotesOutput: FspClient.PostQuotesOutput,
        connectorSettings: ConnectorSettings,
    ): void {
        const transferAmount = postQuotesOutput.transferAmount;
        const payeeReceiveAmount = postQuotesOutput.payeeReceiveAmount;

        if (transferAmount == null) {
            throw new FspiopException(
                FspiopErrors.INTERNAL_SERVER_ERROR,
                'FspClient.postQuotes returned empty transferAmount',
            );
        }

        if (payeeReceiveAmount == null) {
            throw new FspiopException(
                FspiopErrors.INTERNAL_SERVER_ERROR,
                'FspClient.postQuotes returned empty payeeReceiveAmount',
            );
        }

        if (!connectorSettings.isCurrencySupported(transferAmount.currency)) {
            throw new FspiopException(
                FspiopErrors.PAYEE_UNSUPPORTED_CURRENCY,
                `Currency ${transferAmount.currency} is not supported by connector ${connectorSettings.connectorId}`,
            );
        }

        if (transferAmount.currency !== payeeReceiveAmount.currency) {
            throw new FspiopException(
                FspiopErrors.GENERIC_VALIDATION_ERROR,
                'transferAmount.currency and payeeReceiveAmount.currency must match.',
            );
        }

        FspiopMoney.validate(transferAmount);
        FspiopMoney.validate(payeeReceiveAmount);
    }

    static validatePostTransfersRequest(
        postTransferRequest: TransfersPostRequest,
        connectorSettings: ConnectorSettings,
    ): void {
        const transferId = postTransferRequest.transferId?.trim();

        if (transferId == null || transferId.length === 0) {
            throw new FspiopException(
                FspiopErrors.MISSING_MANDATORY_ELEMENT,
                'postTransferRequest.transferId is required',
            );
        }

        const payeeFsp = postTransferRequest.payeeFsp?.trim();

        if (payeeFsp == null || payeeFsp.length === 0) {
            throw new FspiopException(
                FspiopErrors.MISSING_MANDATORY_ELEMENT,
                'postTransferRequest.payeeFsp is required',
            );
        }

        const transferAmount = postTransferRequest.amount;

        if (transferAmount == null) {
            throw new FspiopException(
                FspiopErrors.MISSING_MANDATORY_ELEMENT,
                'postTransferRequest.amount is required',
            );
        }

        if (!connectorSettings.isCurrencySupported(transferAmount.currency)) {
            throw new FspiopException(
                FspiopErrors.PAYEE_UNSUPPORTED_CURRENCY,
                `Currency ${transferAmount.currency} is not supported by connector ${connectorSettings.connectorId}`,
            );
        }

        const ilpPacket = postTransferRequest.ilpPacket?.trim();

        if (ilpPacket == null || ilpPacket.length === 0) {
            throw new FspiopException(
                FspiopErrors.MISSING_MANDATORY_ELEMENT,
                'postTransferRequest.ilpPacket is required',
            );
        }

        const condition = postTransferRequest.condition?.trim();

        if (condition == null || condition.length === 0) {
            throw new FspiopException(
                FspiopErrors.MISSING_MANDATORY_ELEMENT,
                'postTransferRequest.condition is required',
            );
        }

        const expiration = postTransferRequest.expiration?.trim();

        if (expiration == null || expiration.length === 0) {
            throw new FspiopException(
                FspiopErrors.MISSING_MANDATORY_ELEMENT,
                'postTransferRequest.expiration is required',
            );
        }

        FspiopMoney.validate(transferAmount);
    }

    static validateAndUnwrapTransferIlpPacket(
        postTransferRequest: TransfersPostRequest,
    ): ReturnType<typeof Interledger.unwrap> {
        const currencyProfile = FspiopCurrencies.get(postTransferRequest.amount.currency);

        if (currencyProfile == null) {
            throw new FspiopException(
                FspiopErrors.PAYEE_UNSUPPORTED_CURRENCY,
                `Unsupported currency ${postTransferRequest.amount.currency}`,
            );
        }

        let ilpPrepare: ReturnType<typeof Interledger.unwrap>;

        try {
            ilpPrepare = Interledger.unwrap(postTransferRequest.ilpPacket);
        } catch {
            throw new FspiopException(
                FspiopErrors.GENERIC_VALIDATION_ERROR,
                'postTransferRequest.ilpPacket is invalid',
            );
        }

        let ilpPacketAmount: bigint;

        try {
            ilpPacketAmount = BigInt(ilpPrepare.amount);
        } catch {
            throw new FspiopException(
                FspiopErrors.GENERIC_VALIDATION_ERROR,
                'ILP packet amount is invalid',
            );
        }

        const transferAmount = FspiopMoney.serialize(postTransferRequest.amount.amount, currencyProfile.scale);

        if (ilpPacketAmount !== transferAmount) {
            throw new FspiopException(
                FspiopErrors.MODIFIED_REQUEST,
                'Transfer amount and ILP packet amount must be the same',
            );
        }

        const requestExpirationEpoch = new Date(postTransferRequest.expiration).getTime();

        if (Number.isNaN(requestExpirationEpoch)) {
            throw new FspiopException(
                FspiopErrors.GENERIC_VALIDATION_ERROR,
                'postTransferRequest.expiration is invalid',
            );
        }

        const ilpPacketExpirationEpoch = new Date(ilpPrepare.expiresAt).getTime();

        if (Number.isNaN(ilpPacketExpirationEpoch)) {
            throw new FspiopException(
                FspiopErrors.GENERIC_VALIDATION_ERROR,
                'ILP packet expiration is invalid',
            );
        }

        if (requestExpirationEpoch !== ilpPacketExpirationEpoch) {
            throw new FspiopException(
                FspiopErrors.MODIFIED_REQUEST,
                'Transfer expiration and ILP packet expiration must be the same',
            );
        }

        if (requestExpirationEpoch <= Date.now()) {
            throw new FspiopException(
                FspiopErrors.TRANSFER_EXPIRED,
                'Transfer already expired',
            );
        }

        return ilpPrepare;
    }
}
