import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { TransactionMessage } from '@core/audit/common';
import { AuditTransactionPublisher } from '@core/audit/producer';
import {
    ExtensionList,
    FspiopAxios,
    FspiopAxiosError,
    FspiopErrors,
    FspiopErrorTranslator,
    FspiopException,
    FspiopHeaders,
    FspiopPubSubSubjects,
    FspiopResponseSubscriber,
    PartiesTypeIDPutResponse,
    Party,
    PartyComplexName,
    PartyIdInfo,
    PartyPersonalInfo,
} from '@shared/fspiop';
import { AmountDecimalValidator, RedisClient } from '../component';
import { TransferRequest } from '../cache';
import { FspParty, SendMoneyRequest } from '../dto';
import { PostSendMoneyCommand } from './post-send-money.command';
import { SendMoneyResponseMapper } from './send-money-response.mapper';

@CommandHandler(PostSendMoneyCommand)
export class PostSendMoneyHandler
    implements ICommandHandler<PostSendMoneyCommand, PostSendMoneyCommand.Output> {

    private readonly logger = new Logger(PostSendMoneyHandler.name);

    constructor(
        @Inject(FspiopAxios)
        private readonly fspiopAxios: FspiopAxios,
        @Inject(FspiopResponseSubscriber)
        private readonly subscriber: FspiopResponseSubscriber,
        @Inject(RedisClient)
        private readonly redisClient: RedisClient,
        @Inject(AuditTransactionPublisher)
        private readonly auditPublisher: AuditTransactionPublisher,
        @Inject(AmountDecimalValidator)
        private readonly amountDecimalValidator: AmountDecimalValidator,
    ) {
    }

    private static toSubId(idSubValue: string | undefined): string | undefined {
        const subId = idSubValue?.trim();
        return subId == null || subId.length === 0 ? undefined : subId;
    }

    private static toFspParty(callback: PartiesTypeIDPutResponse): FspParty {
        const fspParty = new FspParty();
        const { party } = callback;
        const { partyIdInfo } = party;
        const complexName = party.personalInfo?.complexName;

        fspParty.idType = partyIdInfo.partyIdType;
        fspParty.idValue = partyIdInfo.partyIdentifier;
        fspParty.idSubValue = PostSendMoneyHandler.toSubId(partyIdInfo.partySubIdOrType);
        fspParty.displayName = party.name;
        fspParty.firstName = complexName?.firstName;
        fspParty.middleName = complexName?.middleName;
        fspParty.lastName = complexName?.lastName;
        fspParty.dateOfBirth = party.personalInfo?.dateOfBirth;
        fspParty.merchantClassificationCode = party.merchantClassificationCode;
        fspParty.fspId = partyIdInfo.fspId ?? '';
        fspParty.extensionList = partyIdInfo.extensionList?.extension;

        return fspParty;
    }

    private static toTransferRequest(
        request: SendMoneyRequest,
        callback: PartiesTypeIDPutResponse,
        transferId: string,
        initiatedTimestamp: string,
    ): TransferRequest {
        const transferRequest = new TransferRequest();
        transferRequest.payer = PostSendMoneyHandler.toParty(request.from);
        transferRequest.payee = callback.party;
        transferRequest.quotes = undefined;
        transferRequest.transfer = undefined;
        transferRequest.transferId = transferId;
        transferRequest.homeTransactionId = request.homeTransactionId;
        transferRequest.initiatedTimestamp = initiatedTimestamp;
        transferRequest.from = request.from;
        transferRequest.to = PostSendMoneyHandler.toFspParty(callback);
        transferRequest.amountType = request.amountType;
        transferRequest.currency = request.currency;
        transferRequest.amount = request.amount;
        transferRequest.transactionType = request.transactionType;
        transferRequest.subScenario = request.subScenario;
        transferRequest.note = request.note;
        transferRequest.supportedCurrencies = callback.party.supportedCurrencies;

        return transferRequest;
    }

    private static toParty(fspParty: FspParty): Party {
        const party = new Party();
        party.partyIdInfo = PostSendMoneyHandler.toPartyIdInfo(fspParty);
        party.merchantClassificationCode = fspParty.merchantClassificationCode;
        party.name = fspParty.displayName;
        party.personalInfo = PostSendMoneyHandler.toPartyPersonalInfo(fspParty);

        return party;
    }

    private static toPartyIdInfo(fspParty: FspParty): PartyIdInfo {
        const partyIdInfo = new PartyIdInfo();
        partyIdInfo.partyIdType = fspParty.idType;
        partyIdInfo.partyIdentifier = fspParty.idValue;
        partyIdInfo.partySubIdOrType = PostSendMoneyHandler.toOptionalValue(fspParty.idSubValue);
        partyIdInfo.fspId = fspParty.fspId;
        partyIdInfo.extensionList = PostSendMoneyHandler.toExtensionList(fspParty.extensionList);

        return partyIdInfo;
    }

    private static toPartyPersonalInfo(fspParty: FspParty): PartyPersonalInfo | undefined {
        const partyPersonalInfo = new PartyPersonalInfo();
        partyPersonalInfo.complexName = PostSendMoneyHandler.toPartyComplexName(fspParty);
        partyPersonalInfo.dateOfBirth = fspParty.dateOfBirth;

        if (partyPersonalInfo.complexName == null && partyPersonalInfo.dateOfBirth == null) {
            return undefined;
        }

        return partyPersonalInfo;
    }

    private static toPartyComplexName(fspParty: FspParty): PartyComplexName | undefined {
        const partyComplexName = new PartyComplexName();
        partyComplexName.firstName = fspParty.firstName;
        partyComplexName.middleName = fspParty.middleName;
        partyComplexName.lastName = fspParty.lastName;

        if (
            partyComplexName.firstName == null
            && partyComplexName.middleName == null
            && partyComplexName.lastName == null
        ) {
            return undefined;
        }

        return partyComplexName;
    }

    private static toExtensionList(extensionList: FspParty['extensionList']): ExtensionList | undefined {
        if (extensionList == null || extensionList.length === 0) {
            return undefined;
        }

        const normalizedExtensionList = new ExtensionList();
        normalizedExtensionList.extension = extensionList;

        return normalizedExtensionList;
    }

    private static toOptionalValue(value: string | undefined): string | undefined {
        const normalizedValue = value?.trim();

        return normalizedValue == null || normalizedValue.length === 0
            ? undefined
            : normalizedValue;
    }

    async execute(command: PostSendMoneyCommand): Promise<PostSendMoneyCommand.Output> {

        const { correlationId, source, request } = command.input;
        const transferId = correlationId;
        const destination = request.to.fspId;
        const type = request.to.idType;
        const id = request.to.idValue;
        const subId = PostSendMoneyHandler.toSubId(request.to.idSubValue);
        const payerSubId = PostSendMoneyHandler.toSubId(request.from.idSubValue);
        const { partiesUrl, switchId } = this.fspiopAxios.settings;
        const createdAt = new Date();
        this.amountDecimalValidator.validate(request.amount);

        const headers = FspiopHeaders.Values.Parties.forRequest(correlationId, source, destination);
        try {
            await this.auditPublisher.publish(
                TransactionMessage.request(
                    TransactionMessage.InvocationPhase.Parties,
                    TransactionMessage.InvocationGateway.Outbound,
                    {
                        correlationId,
                        payerFsp: source,
                        payeeFsp: destination,
                        payerIdType: request.from.idType,
                        payerId: request.from.idValue,
                        payerSubId: payerSubId ?? null,
                        payeeIdType: type,
                        payeeId: id,
                        payeeSubId: subId ?? null,
                        transactionInitiatorType: request.from.type ?? null,
                        transactionType: request.transactionType,
                        subScenario: request.subScenario,
                        request: {
                            partyIdType: type,
                            partyId: id,
                            subId: subId ?? null,
                        },
                        occurredAt: createdAt,
                    },
                ),
            );

            const successSubject = FspiopPubSubSubjects.Parties.forSuccess(source, destination, type, id, subId);
            const errorSubject = FspiopPubSubSubjects.Parties.forError(source, destination, type, id, subId);
            const hubErrorSubject = FspiopPubSubSubjects.Parties.forError(source, switchId, type, id, subId);

            const waitPromise = this.subscriber.waitFor<PartiesTypeIDPutResponse>(
                successSubject,
                errorSubject,
                hubErrorSubject,
            );

            try {
                await this.fspiopAxios.getParties(partiesUrl, headers, type, id, subId);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                const stack = error instanceof Error ? error.stack : undefined;

                this.logger.error(`getParties failed for payeeId=${id}`, stack ?? message);
                this.subscriber.cancel(successSubject);
                throw error;
            }

            const callback = await waitPromise;
            const cachedTransaction = PostSendMoneyHandler.toTransferRequest(
                request,
                callback,
                transferId,
                createdAt.toISOString(),
            );
            const response = SendMoneyResponseMapper.toWaitingForPartyAcceptance(cachedTransaction);

            await this.redisClient.set(transferId, cachedTransaction);
            await this.auditPublisher.publish(
                TransactionMessage.response(
                    TransactionMessage.InvocationPhase.Parties,
                    TransactionMessage.InvocationGateway.Outbound,
                    {
                        correlationId,
                        payerFsp: source,
                        payeeFsp: destination,
                        payerIdType: request.from.idType,
                        payerId: request.from.idValue,
                        payerSubId: payerSubId ?? null,
                        payeeIdType: type,
                        payeeId: id,
                        payeeSubId: subId ?? null,
                        response: callback,
                        occurredAt: new Date(),
                    },
                ),
            );

            return new PostSendMoneyCommand.Output(
                response,
                callback,
            );
        } catch (error) {
            this.logger.error(`Post SendMoney Error Response for FromIdValue ${request.from.idValue} toIdValue ${request.to.idValue} : ${JSON.stringify(error)}`);
            const fspiopException = PostSendMoneyHandler.toFspiopException(error);
            try {
                await this.auditPublisher.publish(
                    TransactionMessage.error(
                        TransactionMessage.InvocationPhase.Parties,
                        TransactionMessage.InvocationGateway.Outbound,
                        {
                            correlationId,
                            payerFsp: source,
                            payeeFsp: destination,
                            payerIdType: request.from.idType,
                            payerId: request.from.idValue,
                            payerSubId: payerSubId ?? null,
                            payeeIdType: type,
                            payeeId: id,
                            payeeSubId: subId ?? null,
                            error: fspiopException.toErrorObject(),
                            occurredAt: new Date(),
                        },
                    ),
                );
            } finally {
                try {
                    await this.redisClient.delete(transferId);
                } finally {
                    throw fspiopException;
                }
            }
        }
    }

    private static toFspiopException(error: unknown): FspiopException {
        if (FspiopAxiosError.is(error)) {
            const info = error.errorInformationResponse?.errorInformation;
            const code = info?.errorCode ?? '';
            const desc = info?.errorDescription?.trim().length
                ? info.errorDescription
                : 'Communication error';
            const extensionList = info?.extensionList;
            const errorDef = FspiopErrors.find(code) ?? FspiopErrors.COMMUNICATION_ERROR;

            return new FspiopException(errorDef, desc, extensionList);
        }

        return FspiopErrorTranslator.toFspiopException(error);
    }
}
