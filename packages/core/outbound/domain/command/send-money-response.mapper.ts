import { Extension, ExtensionList, TransferState } from '@shared/fspiop';
import { TransferRequest } from '../cache';
import { SendMoneyResponse, StateEnum } from '../dto';

export class SendMoneyResponseMapper {
    private static readonly DIRECTION = 'OUTGOING';

    static toWaitingForPartyAcceptance(transferRequest: TransferRequest): SendMoneyResponse {
        return SendMoneyResponseMapper.toResponse(
            transferRequest,
            StateEnum.WaitingForPartyAcceptance,
        );
    }

    static toWaitingForQuoteAcceptance(
        transferRequest: TransferRequest,
        payeeFspFeeAmount: string | undefined,
        extensionList: ExtensionList | undefined,
    ): SendMoneyResponse {
        return SendMoneyResponseMapper.toResponse(
            transferRequest,
            StateEnum.WaitingForQuoteAcceptance,
            payeeFspFeeAmount,
            SendMoneyResponseMapper.toExtensionArray(extensionList),
        );
    }

    static toFinalState(
        transferRequest: TransferRequest,
        transferState: TransferState,
        extensionList: ExtensionList | undefined,
    ): SendMoneyResponse {
        const payeeFspFeeAmount = transferRequest.quotes?.payeeFspFee?.amount;
        const currentState = transferState === TransferState.Aborted
            ? StateEnum.Aborted
            : StateEnum.Completed;

        return SendMoneyResponseMapper.toResponse(
            transferRequest,
            currentState,
            payeeFspFeeAmount,
            SendMoneyResponseMapper.toExtensionArray(extensionList),
        );
    }

    private static toResponse(
        transferRequest: TransferRequest,
        currentState: StateEnum,
        payeeFspFeeAmount?: string,
        extensionList?: Array<Extension>,
    ): SendMoneyResponse {

        const feeByKey = SendMoneyResponseMapper.indexExtensions(extensionList);

        const response = new SendMoneyResponse();
        
        response.transferId = transferRequest.transferId;
        response.homeTransactionId = transferRequest.homeTransactionId;
        response.from = transferRequest.from;
        response.to = transferRequest.to;
        response.amountType = transferRequest.amountType;
        response.transactionType = transferRequest.transactionType;
        response.note = transferRequest.note;
        response.amount = transferRequest.amount;
        response.payeeFspFeeAmount = payeeFspFeeAmount;
        response.payeeFee = feeByKey.get('payeefee') ?? "0";
        response.payerFee = feeByKey.get('payerfee') ?? "0";
        response.schemeFee = feeByKey.get('schemefee') ?? "0";
        response.currency = transferRequest.currency;
        response.currentState = currentState;
        response.initiatedTimestamp = transferRequest.initiatedTimestamp;
        response.direction = SendMoneyResponseMapper.DIRECTION;
        response.supportedCurrencies = transferRequest.supportedCurrencies;
        response.extensionList = extensionList;

        return response;
    }

    private static toExtensionArray(extensionList: ExtensionList | undefined): Array<Extension> | undefined {
        return extensionList?.extension;
    }

    private static indexExtensions(
        extensionList: Array<Extension> | undefined,
    ): Map<string, string> {
        const map = new Map<string, string>();

        for (const ext of extensionList ?? []) {
            const key = ext.key?.trim().toLowerCase();
            const value = ext.value?.trim();
            if (key && value) {
                map.set(key, value);
            }
        }

        return map;
    }
}
