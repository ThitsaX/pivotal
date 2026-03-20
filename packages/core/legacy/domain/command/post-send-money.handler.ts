import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {Ulid} from '@shared/ulid';
import {
    ExtensionList,
    FspiopAxios,
    FspiopAxiosError,
    FspiopErrors,
    FspiopException,
    FspiopHeaders,
    FspiopPubSubSubjects,
    FspiopResponseSubscriber,
    Party,
    PartyComplexName,
    PartyIdInfo,
    PartyPersonalInfo,
    PartiesTypeIDPutResponse,
} from '@shared/fspiop';
import {RedisClient} from '../component';
import {TransferRequest} from '../cache';
import {FspParty, SendMoneyRequest, SendMoneyResponse} from '../dto';
import {PostSendMoneyCommand} from './post-send-money.command';

@CommandHandler(PostSendMoneyCommand)
export class PostSendMoneyHandler
    implements ICommandHandler<PostSendMoneyCommand, PostSendMoneyCommand.Output> {

    constructor(
        @Inject(FspiopAxios)
        private readonly fspiopAxios: FspiopAxios,
        @Inject(FspiopResponseSubscriber)
        private readonly subscriber: FspiopResponseSubscriber,
        @Inject(RedisClient)
        private readonly redisClient: RedisClient,
    ) {
    }

    async execute(command: PostSendMoneyCommand): Promise<PostSendMoneyCommand.Output> {
        const transferId = Ulid.generate();
        const {source, request} = command.input;
        const destination = request.to.fspId;
        const type = request.to.idType;
        const id = request.to.idValue;
        const subId = PostSendMoneyHandler.toSubId(request.to.idSubValue);
        const {partiesUrl, switchId} = this.fspiopAxios.settings;

        const headers = FspiopHeaders.Values.Parties.forRequest(source, destination);

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
            this.subscriber.cancel(successSubject);

            if (FspiopAxiosError.is(error)) {
                const info = error.errorInformationResponse?.errorInformation;
                const code = info?.errorCode ?? '';
                const desc = info?.errorDescription?.trim().length
                    ? info.errorDescription
                    : 'Communication error';
                const extensionList = info?.extensionList;
                const errorDef = FspiopErrors.find(code) ?? FspiopErrors.COMMUNICATION_ERROR;

                throw new FspiopException(errorDef, desc, extensionList);
            }

            throw error;
        }

        const callback = await waitPromise;
        const response = PostSendMoneyHandler.toResponse(transferId, callback);
        const cachedTransaction = PostSendMoneyHandler.toTransferRequest(request, response, callback);

        await this.redisClient.set(transferId, cachedTransaction);

        return new PostSendMoneyCommand.Output(
            response,
            callback,
        );
    }

    private static toSubId(idSubValue: string | undefined): string | undefined {
        const subId = idSubValue?.trim();
        return subId == null || subId.length === 0 ? undefined : subId;
    }

    private static toResponse(
        transferId: string,
        callback: PartiesTypeIDPutResponse,
    ): SendMoneyResponse {
        const response = new SendMoneyResponse();
        response.transferId = transferId;
        response.to = PostSendMoneyHandler.toFspParty(callback);
        response.supportedCurrencies = callback.party.supportedCurrencies;

        return response;
    }

    private static toFspParty(callback: PartiesTypeIDPutResponse): FspParty {
        const fspParty = new FspParty();
        const {party} = callback;
        const {partyIdInfo} = party;
        const complexName = party.personalInfo?.complexName;

        fspParty.idType = partyIdInfo.partyIdType;
        fspParty.idValue = partyIdInfo.partyIdentifier;
        fspParty.idSubValue = partyIdInfo.partySubIdOrType ?? '';
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
        response: SendMoneyResponse,
        callback: PartiesTypeIDPutResponse,
    ): TransferRequest {
        const transferRequest = new TransferRequest();
        transferRequest.payer = PostSendMoneyHandler.toParty(request.from);
        transferRequest.payee = callback.party;
        transferRequest.quotes = undefined;
        transferRequest.transfer = undefined;
        transferRequest.transferId = response.transferId ?? '';
        transferRequest.homeTransactionId = request.homeTransactionId;
        transferRequest.from = request.from;
        transferRequest.to = response.to ?? request.to;
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
}
