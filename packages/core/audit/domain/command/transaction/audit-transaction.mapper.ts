import {TransactionMessage} from '@core/audit/common';
import {
    Currency,
    PartyIdType,
    QuotesPostRequest,
    TransferState,
    TransfersIDPatchResponse,
    TransfersIDPutResponse,
    TransfersPostRequest,
} from '@shared/fspiop';
import {TransactionRepository} from '../../repository';
import {AuditPartiesErrorCommand} from '../parties/audit-parties-error.command';
import {AuditPartiesRequestCommand} from '../parties/audit-parties-request.command';
import {AuditPartiesResponseCommand} from '../parties/audit-parties-response.command';
import {AuditPatchErrorCommand} from '../patch/audit-patch-error.command';
import {AuditPatchRequestCommand} from '../patch/audit-patch-request.command';
import {AuditPatchResponseCommand} from '../patch/audit-patch-response.command';
import {AuditQuotesErrorCommand} from '../quotes/audit-quotes-error.command';
import {AuditQuotesRequestCommand} from '../quotes/audit-quotes-request.command';
import {AuditQuotesResponseCommand} from '../quotes/audit-quotes-response.command';
import {AuditTransfersErrorCommand} from '../transfers/audit-transfers-error.command';
import {AuditTransfersRequestCommand} from '../transfers/audit-transfers-request.command';
import {AuditTransfersResponseCommand} from '../transfers/audit-transfers-response.command';

export class AuditTransactionMapper {

    private static readonly PARTIES_FLOW = 1;
    private static readonly QUOTES_FLOW = 2;
    private static readonly TRANSFERS_FLOW = 3;

    static toPartiesRequestInput(
        input: AuditPartiesRequestCommand.Input,
    ): TransactionRepository.UpsertInput {
        const occurredAt = AuditTransactionMapper.resolveOccurredAt(input.occurredAt);

        return {
            correlationId: input.correlationId,
            payerFsp: input.payerFsp,
            payeeFsp: input.payeeFsp,
            payerIdType: input.payerIdType,
            payerId: input.payerId,
            payerSubId: input.payerSubId,
            payeeIdType: input.payeeIdType,
            payeeId: input.payeeId,
            payeeSubId: input.payeeSubId,
            transactionStartedAt: occurredAt,
            transactionInitiatorType: input.transactionInitiatorType,
            transactionType: input.transactionType,
            subScenario: input.subScenario,
            error: false,
            partiesRequestedAt: occurredAt,
            partiesRequest: input.request,
            createdAt: occurredAt,
            ...AuditTransactionMapper.toPartiesRequestedGatewayFields(input.gateway, occurredAt),
        };
    }

    static toPartiesResponseInput(
        input: AuditPartiesResponseCommand.Input,
    ): TransactionRepository.UpsertInput {
        const occurredAt = AuditTransactionMapper.resolveOccurredAt(input.occurredAt);
        const responsePartyIdInfo = AuditTransactionMapper.toPartyIdInfo(input.response);

        return {
            correlationId: input.correlationId,
            payerFsp: input.payerFsp,
            payeeFsp: responsePartyIdInfo?.fspId ?? input.payeeFsp,
            payerIdType: input.payerIdType,
            payerId: input.payerId,
            payerSubId: input.payerSubId,
            payeeIdType: responsePartyIdInfo?.partyIdType ?? input.payeeIdType,
            payeeId: responsePartyIdInfo?.partyIdentifier ?? input.payeeId,
            payeeSubId: responsePartyIdInfo?.partySubIdOrType ?? input.payeeSubId,
            transactionStartedAt: occurredAt,
            error: false,
            flow: AuditTransactionMapper.PARTIES_FLOW,
            partiesRespondedAt: occurredAt,
            partiesResponse: input.response,
            createdAt: occurredAt,
            ...AuditTransactionMapper.toPartiesRespondedGatewayFields(input.gateway, occurredAt),
        };
    }

    static toPartiesErrorInput(
        input: AuditPartiesErrorCommand.Input,
    ): TransactionRepository.UpsertInput {
        const occurredAt = AuditTransactionMapper.resolveOccurredAt(input.occurredAt);

        return {
            correlationId: input.correlationId,
            payerFsp: input.payerFsp,
            payeeFsp: input.payeeFsp,
            payerIdType: input.payerIdType,
            payerId: input.payerId,
            payerSubId: input.payerSubId,
            payeeIdType: input.payeeIdType,
            payeeId: input.payeeId,
            payeeSubId: input.payeeSubId,
            transactionStartedAt: occurredAt,
            transactionCompletedAt: occurredAt,
            error: true,
            flow: AuditTransactionMapper.PARTIES_FLOW,
            partiesRespondedAt: occurredAt,
            partiesError: input.error,
            createdAt: occurredAt,
            ...AuditTransactionMapper.toPartiesRespondedGatewayFields(input.gateway, occurredAt),
        };
    }

    static toQuotesRequestInput(
        input: AuditQuotesRequestCommand.Input,
    ): TransactionRepository.UpsertInput {
        const occurredAt = AuditTransactionMapper.resolveOccurredAt(input.occurredAt);
        const request = AuditTransactionMapper.toQuotesRequest(input.request);
        const correlationId = AuditTransactionMapper.toQuotesCorrelationId(input.correlationId, request);
        const payerParty = request?.payer?.partyIdInfo;
        const payeeParty = request?.payee?.partyIdInfo;

        return {
            correlationId,
            payerFsp: payerParty?.fspId ?? input.payerFsp,
            payeeFsp: payeeParty?.fspId ?? input.payeeFsp,
            payerIdType: payerParty?.partyIdType ?? null,
            payerId: payerParty?.partyIdentifier ?? null,
            payerSubId: payerParty?.partySubIdOrType ?? null,
            payeeIdType: payeeParty?.partyIdType ?? null,
            payeeId: payeeParty?.partyIdentifier ?? null,
            payeeSubId: payeeParty?.partySubIdOrType ?? null,
            transactionInitiatorType: request?.transactionType?.initiatorType ?? null,
            quotingCurrency: request?.amount.currency ?? null,
            quotingAmount: AuditTransactionMapper.toNumber(request?.amount.amount),
            transactionStartedAt: occurredAt,
            transactionType: request?.transactionType?.scenario ?? null,
            subScenario: request?.transactionType?.subScenario ?? null,
            error: false,
            quotesRequestedAt: occurredAt,
            quotesRequest: request,
            createdAt: occurredAt,
            ...AuditTransactionMapper.toQuotesRequestedGatewayFields(input.gateway, occurredAt),
        };
    }

    static toQuotesResponseInput(
        input: AuditQuotesResponseCommand.Input,
    ): TransactionRepository.UpsertInput {
        const occurredAt = AuditTransactionMapper.resolveOccurredAt(input.occurredAt);
        const request = AuditTransactionMapper.toQuotesRequest(input.request);
        const response = AuditTransactionMapper.toQuotesResponse(input.response);
        const correlationId = AuditTransactionMapper.toQuotesCorrelationId(input.correlationId, request);
        const payerParty = request?.payer?.partyIdInfo;
        const payeeParty = request?.payee?.partyIdInfo;
        const transferAmount = response?.transferAmount;

        return {
            correlationId,
            payerFsp: payerParty?.fspId ?? input.payerFsp,
            payeeFsp: payeeParty?.fspId ?? input.payeeFsp,
            payerIdType: payerParty?.partyIdType ?? null,
            payerId: payerParty?.partyIdentifier ?? null,
            payerSubId: payerParty?.partySubIdOrType ?? null,
            payeeIdType: payeeParty?.partyIdType ?? null,
            payeeId: payeeParty?.partyIdentifier ?? null,
            payeeSubId: payeeParty?.partySubIdOrType ?? null,
            transactionInitiatorType: request?.transactionType?.initiatorType ?? null,
            quotingCurrency: request?.amount.currency ?? null,
            quotingAmount: AuditTransactionMapper.toNumber(request?.amount.amount),
            transferCurrency: AuditTransactionMapper.toCurrency(transferAmount?.currency),
            transferAmount: AuditTransactionMapper.toNumber(transferAmount?.amount),
            transactionStartedAt: occurredAt,
            transactionType: request?.transactionType?.scenario ?? null,
            subScenario: request?.transactionType?.subScenario ?? null,
            error: false,
            flow: AuditTransactionMapper.QUOTES_FLOW,
            quotesRespondedAt: occurredAt,
            quotesRequest: request,
            quotesResponse: response,
            createdAt: occurredAt,
            ...AuditTransactionMapper.toQuotesRespondedGatewayFields(input.gateway, occurredAt),
        };
    }

    static toQuotesErrorInput(
        input: AuditQuotesErrorCommand.Input,
    ): TransactionRepository.UpsertInput {
        const occurredAt = AuditTransactionMapper.resolveOccurredAt(input.occurredAt);
        const request = AuditTransactionMapper.toQuotesRequest(input.request);
        const correlationId = AuditTransactionMapper.toQuotesCorrelationId(input.correlationId, request);
        const payerParty = request?.payer?.partyIdInfo;
        const payeeParty = request?.payee?.partyIdInfo;

        return {
            correlationId,
            payerFsp: payerParty?.fspId ?? input.payerFsp,
            payeeFsp: payeeParty?.fspId ?? input.payeeFsp,
            payerIdType: payerParty?.partyIdType ?? null,
            payerId: payerParty?.partyIdentifier ?? null,
            payerSubId: payerParty?.partySubIdOrType ?? null,
            payeeIdType: payeeParty?.partyIdType ?? null,
            payeeId: payeeParty?.partyIdentifier ?? null,
            payeeSubId: payeeParty?.partySubIdOrType ?? null,
            transactionInitiatorType: request?.transactionType?.initiatorType ?? null,
            quotingCurrency: request?.amount.currency ?? null,
            quotingAmount: AuditTransactionMapper.toNumber(request?.amount.amount),
            transactionStartedAt: occurredAt,
            transactionCompletedAt: occurredAt,
            transactionType: request?.transactionType?.scenario ?? null,
            subScenario: request?.transactionType?.subScenario ?? null,
            error: true,
            flow: AuditTransactionMapper.QUOTES_FLOW,
            quotesRespondedAt: occurredAt,
            quotesRequest: request,
            quotesError: input.error,
            createdAt: occurredAt,
            ...AuditTransactionMapper.toQuotesRespondedGatewayFields(input.gateway, occurredAt),
        };
    }

    static toTransfersRequestInput(
        input: AuditTransfersRequestCommand.Input,
    ): TransactionRepository.UpsertInput {
        const occurredAt = AuditTransactionMapper.resolveOccurredAt(input.occurredAt);
        const request = AuditTransactionMapper.toTransfersRequest(input.request);
        const correlationId = AuditTransactionMapper.toTransfersCorrelationId(input.correlationId, request);

        return {
            correlationId,
            payerFsp: request?.payerFsp ?? input.payerFsp,
            payeeFsp: request?.payeeFsp ?? input.payeeFsp,
            transferCurrency: request?.amount?.currency ?? null,
            transferAmount: AuditTransactionMapper.toNumber(request?.amount?.amount),
            transactionStartedAt: occurredAt,
            error: false,
            transfersRequestedAt: occurredAt,
            transfersRequest: input.request,
            createdAt: occurredAt,
            ...AuditTransactionMapper.toTransfersRequestedGatewayFields(input.gateway, occurredAt),
        };
    }

    static toTransfersResponseInput(
        input: AuditTransfersResponseCommand.Input,
    ): TransactionRepository.UpsertInput {
        const occurredAt = AuditTransactionMapper.resolveOccurredAt(input.occurredAt);
        const request = AuditTransactionMapper.toTransfersRequest(input.request);
        const response = AuditTransactionMapper.toTransfersResponse(input.response);
        const correlationId = AuditTransactionMapper.toTransfersCorrelationId(input.correlationId, request);

        return {
            correlationId,
            payerFsp: request?.payerFsp ?? input.payerFsp,
            payeeFsp: request?.payeeFsp ?? input.payeeFsp,
            transferCurrency: request?.amount?.currency ?? null,
            transferAmount: AuditTransactionMapper.toNumber(request?.amount?.amount),
            transactionStartedAt: occurredAt,
            transactionCompletedAt: occurredAt,
            transferState: response?.transferState ?? null,
            error: false,
            flow: AuditTransactionMapper.TRANSFERS_FLOW,
            transfersRespondedAt: occurredAt,
            transfersRequest: input.request,
            transfersResponse: input.response,
            createdAt: occurredAt,
            ...AuditTransactionMapper.toTransfersRespondedGatewayFields(input.gateway, occurredAt),
        };
    }

    static toTransfersErrorInput(
        input: AuditTransfersErrorCommand.Input,
    ): TransactionRepository.UpsertInput {
        const occurredAt = AuditTransactionMapper.resolveOccurredAt(input.occurredAt);
        const request = AuditTransactionMapper.toTransfersRequest(input.request);
        const correlationId = AuditTransactionMapper.toTransfersCorrelationId(input.correlationId, request);

        return {
            correlationId,
            payerFsp: request?.payerFsp ?? input.payerFsp,
            payeeFsp: request?.payeeFsp ?? input.payeeFsp,
            transferCurrency: request?.amount?.currency ?? null,
            transferAmount: AuditTransactionMapper.toNumber(request?.amount?.amount),
            transactionStartedAt: occurredAt,
            transactionCompletedAt: occurredAt,
            error: true,
            flow: AuditTransactionMapper.TRANSFERS_FLOW,
            transfersRespondedAt: occurredAt,
            transfersRequest: input.request,
            transfersError: input.error,
            createdAt: occurredAt,
            ...AuditTransactionMapper.toTransfersRespondedGatewayFields(input.gateway, occurredAt),
        };
    }

    static toPatchRequestInput(
        input: AuditPatchRequestCommand.Input,
    ): TransactionRepository.UpsertInput {
        const occurredAt = AuditTransactionMapper.resolveOccurredAt(input.occurredAt);

        return {
            correlationId: input.correlationId,
            payerFsp: input.payerFsp,
            payeeFsp: input.payeeFsp,
            transactionStartedAt: occurredAt,
            error: false,
            patchRequestedAt: occurredAt,
            patchRequest: input.request,
            createdAt: occurredAt,
        };
    }

    static toPatchResponseInput(
        input: AuditPatchResponseCommand.Input,
    ): TransactionRepository.UpsertInput {
        const occurredAt = AuditTransactionMapper.resolveOccurredAt(input.occurredAt);

        return {
            correlationId: input.correlationId,
            payerFsp: input.payerFsp,
            payeeFsp: input.payeeFsp,
            transactionStartedAt: occurredAt,
            error: false,
            patchRespondedAt: occurredAt,
            patchRequest: input.request,
            createdAt: occurredAt,
        };
    }

    static toPatchErrorInput(
        input: AuditPatchErrorCommand.Input,
    ): TransactionRepository.UpsertInput {
        const occurredAt = AuditTransactionMapper.resolveOccurredAt(input.occurredAt);

        return {
            correlationId: input.correlationId,
            payerFsp: input.payerFsp,
            payeeFsp: input.payeeFsp,
            transactionStartedAt: occurredAt,
            error: input.error != null,
            possibleDispute: input.error != null,
            patchRespondedAt: occurredAt,
            patchError: input.error,
            createdAt: occurredAt,
        };
    }

    private static toNumber(value: string | null | undefined): number | null {
        return value == null ? null : Number(value);
    }

    private static toCurrency(value: string | null | undefined): Currency | null {
        return value == null ? null : value as Currency;
    }

    private static resolveOccurredAt(value: Date | null | undefined): Date {
        return value ?? new Date();
    }

    private static toQuotesRequest(request: unknown): QuotesPostRequest | null {
        return request == null ? null : request as QuotesPostRequest;
    }

    private static toQuotesResponse(response: unknown): {transferAmount?: {currency?: string; amount?: string}} | null {
        return response == null
            ? null
            : response as {transferAmount?: {currency?: string; amount?: string}};
    }

    private static toTransfersRequest(request: unknown): TransfersPostRequest | null {
        if (request == null) {
            return null;
        }

        const maybeRequest = request as Partial<TransfersPostRequest>;

        if (maybeRequest.amount == null) {
            return null;
        }

        return request as TransfersPostRequest;
    }

    private static toTransfersResponse(
        response: unknown,
    ): (TransfersIDPutResponse | TransfersIDPatchResponse) | null {
        return response == null ? null : response as TransfersIDPutResponse | TransfersIDPatchResponse;
    }

    private static toQuotesCorrelationId(
        fallbackCorrelationId: string,
        request: QuotesPostRequest | null,
    ): string {
        return AuditTransactionMapper.firstNonBlank(
            request?.transactionId,
            request?.transactionRequestId,
            request?.quoteId,
            fallbackCorrelationId,
        );
    }

    private static toTransfersCorrelationId(
        fallbackCorrelationId: string,
        request: TransfersPostRequest | null,
    ): string {
        return AuditTransactionMapper.firstNonBlank(
            request?.transferId,
            fallbackCorrelationId,
        );
    }

    private static firstNonBlank(...values: Array<string | null | undefined>): string {
        for (const value of values) {
            const normalized = value?.trim();

            if (normalized != null && normalized.length > 0) {
                return normalized;
            }
        }

        return '';
    }

    private static toPartyIdInfo(
        response: unknown,
    ): {
        fspId?: string | null;
        partyIdType?: PartyIdType | null;
        partyIdentifier?: string | null;
        partySubIdOrType?: string | null;
    } | null {
        const maybeResponse = response as {
            party?: {
                partyIdInfo?: {
                    fspId?: string | null;
                    partyIdType?: PartyIdType | null;
                    partyIdentifier?: string | null;
                    partySubIdOrType?: string | null;
                };
            };
        } | null;

        return maybeResponse?.party?.partyIdInfo ?? null;
    }

    private static toPartiesRequestedGatewayFields(
        gateway: TransactionMessage.InvocationGateway,
        occurredAt: Date | null,
    ): Partial<TransactionRepository.UpsertInput> {
        switch (gateway) {
            case TransactionMessage.InvocationGateway.Outbound:
                return {outboundPartiesRequestedAt: occurredAt};
            case TransactionMessage.InvocationGateway.Inbound:
                return {inboundPartiesRequestedAt: occurredAt};
            case TransactionMessage.InvocationGateway.Connector:
                return {connectorPartiesRequestedAt: occurredAt};
            default:
                return {};
        }
    }

    private static toPartiesRespondedGatewayFields(
        gateway: TransactionMessage.InvocationGateway,
        occurredAt: Date | null,
    ): Partial<TransactionRepository.UpsertInput> {
        switch (gateway) {
            case TransactionMessage.InvocationGateway.Outbound:
                return {outboundPartiesRespondedAt: occurredAt};
            case TransactionMessage.InvocationGateway.Inbound:
                return {inboundPartiesRespondedAt: occurredAt};
            case TransactionMessage.InvocationGateway.Connector:
                return {connectorPartiesRespondedAt: occurredAt};
            default:
                return {};
        }
    }

    private static toQuotesRequestedGatewayFields(
        gateway: TransactionMessage.InvocationGateway,
        occurredAt: Date | null,
    ): Partial<TransactionRepository.UpsertInput> {
        switch (gateway) {
            case TransactionMessage.InvocationGateway.Outbound:
                return {outboundQuotesRequestedAt: occurredAt};
            case TransactionMessage.InvocationGateway.Inbound:
                return {inboundQuotesRequestedAt: occurredAt};
            case TransactionMessage.InvocationGateway.Connector:
                return {connectorQuotesRequestedAt: occurredAt};
            default:
                return {};
        }
    }

    private static toQuotesRespondedGatewayFields(
        gateway: TransactionMessage.InvocationGateway,
        occurredAt: Date | null,
    ): Partial<TransactionRepository.UpsertInput> {
        switch (gateway) {
            case TransactionMessage.InvocationGateway.Outbound:
                return {outboundQuotesRespondedAt: occurredAt};
            case TransactionMessage.InvocationGateway.Inbound:
                return {inboundQuotesRespondedAt: occurredAt};
            case TransactionMessage.InvocationGateway.Connector:
                return {connectorQuotesRespondedAt: occurredAt};
            default:
                return {};
        }
    }

    private static toTransfersRequestedGatewayFields(
        gateway: TransactionMessage.InvocationGateway,
        occurredAt: Date | null,
    ): Partial<TransactionRepository.UpsertInput> {
        switch (gateway) {
            case TransactionMessage.InvocationGateway.Outbound:
                return {outboundTransfersRequestedAt: occurredAt};
            case TransactionMessage.InvocationGateway.Inbound:
                return {inboundTransfersRequestedAt: occurredAt};
            case TransactionMessage.InvocationGateway.Connector:
                return {connectorTransfersRequestedAt: occurredAt};
            default:
                return {};
        }
    }

    private static toTransfersRespondedGatewayFields(
        gateway: TransactionMessage.InvocationGateway,
        occurredAt: Date | null,
    ): Partial<TransactionRepository.UpsertInput> {
        switch (gateway) {
            case TransactionMessage.InvocationGateway.Outbound:
                return {outboundTransfersRespondedAt: occurredAt};
            case TransactionMessage.InvocationGateway.Inbound:
                return {inboundTransfersRespondedAt: occurredAt};
            case TransactionMessage.InvocationGateway.Connector:
                return {connectorTransfersRespondedAt: occurredAt};
            default:
                return {};
        }
    }
}
