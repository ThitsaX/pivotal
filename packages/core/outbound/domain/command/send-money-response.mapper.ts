import {Extension, ExtensionList, TransferState} from '@shared/fspiop';
import {TransferRequest} from '../cache';
import {SendMoneyResponse, StateEnum} from '../dto';

export class SendMoneyResponseMapper {
    private static readonly DIRECTION = 'OUTGOIND';

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
}
