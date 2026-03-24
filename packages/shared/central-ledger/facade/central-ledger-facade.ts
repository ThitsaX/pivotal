import {FspiopCurrency} from '@shared/fspiop';
import {PivotalException} from '@shared/foundation';
import {CentralLedgerAxios} from '../component';
import {CentralLedgerException} from '../exception';
import {
    CentralLedgerAccount,
    CentralLedgerParticipant,
    ParticipantIsActive,
    PostInitialPositionAndLimitsRequest,
    PostParticipantsNameAccountsRequest,
    PostParticipantsNameEndpointsRequest,
    PostParticipantsRequest,
    SettlementModel,
    SettlementModelDelay,
    SettlementModelGranularity,
    SettlementModelInterchange,
    SettlementModelLedgerAccountType,
} from '../dto';

interface CentralLedgerEndpointDefinition {
    type: string;
    path?: string;
}

export class CentralLedgerFacade {

    private static readonly HUB_NAME = 'Hub';
    private static readonly POSITION_ACCOUNT_TYPE = 'POSITION';
    private static readonly SETTLEMENT_ACCOUNT_TYPE = 'SETTLEMENT';
    private static readonly NET_DEBIT_CAP_LIMIT_TYPE = 'NET_DEBIT_CAP';
    private static readonly HUB_MULTILATERAL_SETTLEMENT_ACCOUNT_TYPE = 'HUB_MULTILATERAL_SETTLEMENT';
    private static readonly HUB_RECONCILIATION_ACCOUNT_TYPE = 'HUB_RECONCILIATION';
    private static readonly DEFERRED_NET_SETTLEMENT_MODEL_PREFIX = 'DEFERREDNET';

    private static readonly PARTICIPANT_ENDPOINTS: ReadonlyArray<CentralLedgerEndpointDefinition> = [
        {type: 'FSPIOP_CALLBACK_URL_AUTHORIZATIONS'},
        {type: 'FSPIOP_CALLBACK_URL_PARTICIPANT_PUT', path: '/participants/{{partyIdType}}/{{partyIdentifier}}'},
        {type: 'FSPIOP_CALLBACK_URL_PARTICIPANT_PUT_ERROR', path: '/participants/{{partyIdType}}/{{partyIdentifier}}/error'},
        {type: 'FSPIOP_CALLBACK_URL_PARTICIPANT_BATCH_PUT', path: '/participants/{{requestId}}'},
        {type: 'FSPIOP_CALLBACK_URL_PARTICIPANT_BATCH_PUT_ERROR', path: '/participants/{{requestId}}/error'},
        {type: 'FSPIOP_CALLBACK_URL_PARTIES_GET', path: '/parties/{{partyIdType}}/{{partyIdentifier}}'},
        {type: 'FSPIOP_CALLBACK_URL_PARTIES_PUT', path: '/parties/{{partyIdType}}/{{partyIdentifier}}'},
        {type: 'FSPIOP_CALLBACK_URL_PARTIES_PUT_ERROR', path: '/parties/{{partyIdType}}/{{partyIdentifier}}/error'},
        {type: 'FSPIOP_CALLBACK_URL_QUOTES'},
        {type: 'FSPIOP_CALLBACK_URL_TRX_REQ_SERVICE'},
        {type: 'FSPIOP_CALLBACK_URL_TRANSFER_POST', path: '/transfers'},
        {type: 'FSPIOP_CALLBACK_URL_TRANSFER_PUT', path: '/transfers/{{transferId}}'},
        {type: 'FSPIOP_CALLBACK_URL_TRANSFER_ERROR', path: '/transfers/{{transferId}}/error'},
        {type: 'FSPIOP_CALLBACK_URL_BULK_TRANSFER_POST', path: '/bulkTransfers'},
        {type: 'FSPIOP_CALLBACK_URL_BULK_TRANSFER_PUT', path: '/bulkTransfers/{{id}}'},
        {type: 'FSPIOP_CALLBACK_URL_BULK_TRANSFER_ERROR', path: '/bulkTransfers/{{id}}/error'},
        {type: 'FSPIOP_CALLBACK_URL_PARTICIPANT_SUB_ID_PUT', path: '/participants/{{partyIdType}}/{{partyIdentifier}}/{{partySubIdOrType}}'},
        {type: 'FSPIOP_CALLBACK_URL_PARTICIPANT_SUB_ID_PUT_ERROR', path: '/participants/{{partyIdType}}/{{partyIdentifier}}/{{partySubIdOrType}}/error'},
        {type: 'FSPIOP_CALLBACK_URL_PARTICIPANT_SUB_ID_DELETE', path: '/participants/{{partyIdType}}/{{partyIdentifier}}/{{partySubIdOrType}}'},
        {type: 'FSPIOP_CALLBACK_URL_PARTIES_SUB_ID_GET', path: '/parties/{{partyIdType}}/{{partyIdentifier}}/{{partySubIdOrType}}'},
        {type: 'FSPIOP_CALLBACK_URL_PARTIES_SUB_ID_PUT', path: '/parties/{{partyIdType}}/{{partyIdentifier}}/{{partySubIdOrType}}'},
        {type: 'FSPIOP_CALLBACK_URL_PARTIES_SUB_ID_PUT_ERROR', path: '/parties/{{partyIdType}}/{{partyIdentifier}}/{{partySubIdOrType}}/error'},
        {type: 'FSPIOP_CALLBACK_URL_FX_TRANSFER_POST', path: '/fxTransfers'},
        {type: 'FSPIOP_CALLBACK_URL_FX_TRANSFER_PUT', path: '/fxTransfers/{{commitRequestId}}'},
        {type: 'FSPIOP_CALLBACK_URL_FX_TRANSFER_ERROR', path: '/fxTransfers/{{commitRequestId}}/error'},
        {type: 'FSPIOP_CALLBACK_URL_FX_QUOTES'},
    ];

    private static rethrowAsPivotalException(error: unknown): void {
        if (error instanceof PivotalException) {
            throw error;
        }

        if (error instanceof CentralLedgerException) {
            throw new PivotalException(error.code, error.description);
        }
    }

    constructor(
        private readonly centralLedgerAxios: CentralLedgerAxios,
    ) {
    }

    async listAvailableEnums(): Promise<unknown> {
        try {
            return await this.centralLedgerAxios.getEnums();
        } catch (error) {
            CentralLedgerFacade.rethrowAsPivotalException(error);

            throw error;
        }
    }

    async onboardFsp(
        name: string,
        currencies: FspiopCurrency[],
        endpoint: string,
    ): Promise<void> {
        try {
            CentralLedgerFacade.validateCurrencies(currencies);

            for (const currency of currencies) {
                await this.addFspCurrency(name, currency);
            }

            await this.registerEndpoints(name, endpoint);
        } catch (error) {
            CentralLedgerFacade.rethrowAsPivotalException(error);

            throw error;
        }
    }

    async addFspCurrency(
        name: string,
        currency: FspiopCurrency,
    ): Promise<void> {
        try {
            const participant = await this.centralLedgerAxios.createParticipant(
                CentralLedgerFacade.toCreateParticipantRequest(name, currency),
            );
            const positionAccount = await this.resolvePositionAccount(name, currency, participant);

            await this.centralLedgerAxios.updateParticipantAccount(
                name,
                positionAccount.id,
                CentralLedgerFacade.toActiveRequest(),
            );

            await this.centralLedgerAxios.createParticipantInitialPositionAndLimits(
                name,
                CentralLedgerFacade.toInitialPositionAndLimitsRequest(currency),
            );
        } catch (error) {
            CentralLedgerFacade.rethrowAsPivotalException(error);

            throw error;
        }
    }

    async createHubMultilateralSettlementAccount(currency: FspiopCurrency): Promise<void> {
        await this.createHubAccount(currency, CentralLedgerFacade.HUB_MULTILATERAL_SETTLEMENT_ACCOUNT_TYPE);
    }

    async createHubReconciliationAccount(currency: FspiopCurrency): Promise<void> {
        await this.createHubAccount(currency, CentralLedgerFacade.HUB_RECONCILIATION_ACCOUNT_TYPE);
    }

    async createDeferredNetSettlementModel(currency: FspiopCurrency): Promise<void> {
        try {
            await this.centralLedgerAxios.createSettlementModel(
                CentralLedgerFacade.toDeferredNetSettlementModelRequest(currency),
            );
        } catch (error) {
            CentralLedgerFacade.rethrowAsPivotalException(error);

            throw error;
        }
    }

    async addHubCurrency(currency: FspiopCurrency): Promise<void> {
        try {
            await this.createHubMultilateralSettlementAccount(currency);
            await this.createHubReconciliationAccount(currency);
            await this.createDeferredNetSettlementModel(currency);
        } catch (error) {
            CentralLedgerFacade.rethrowAsPivotalException(error);

            throw error;
        }
    }

    async listAllParticipants(): Promise<Array<CentralLedgerParticipant>> {
        try {
            return await this.centralLedgerAxios.getParticipants();
        } catch (error) {
            CentralLedgerFacade.rethrowAsPivotalException(error);

            throw error;
        }
    }

    private static validateCurrencies(currencies: FspiopCurrency[]): void {
        if (currencies.length === 0) {
            throw new CentralLedgerException('At least one currency is required.');
        }
    }

    private static toCreateParticipantRequest(name: string, currency: FspiopCurrency): PostParticipantsRequest {
        const request = new PostParticipantsRequest();
        request.name = name;
        request.currency = currency;
        request.isProxy = false;

        return request;
    }

    private static toActiveRequest(): ParticipantIsActive {
        const request = new ParticipantIsActive();
        request.isActive = true;

        return request;
    }

    private static toInitialPositionAndLimitsRequest(currency: FspiopCurrency): PostInitialPositionAndLimitsRequest {
        const request = new PostInitialPositionAndLimitsRequest();
        request.currency = currency;
        request.limit = {
            type: CentralLedgerFacade.NET_DEBIT_CAP_LIMIT_TYPE,
            value: 0,
        };
        request.initialPosition = 0;

        return request;
    }

    private static toCreateHubAccountRequest(
        currency: FspiopCurrency,
        ledgerAccountType: string,
    ): PostParticipantsNameAccountsRequest {
        const request = new PostParticipantsNameAccountsRequest();
        request.currency = currency;
        request.type = ledgerAccountType;

        return request;
    }

    private static toDeferredNetSettlementModelRequest(currency: FspiopCurrency): SettlementModel {
        const request = new SettlementModel();
        request.name = `${CentralLedgerFacade.DEFERRED_NET_SETTLEMENT_MODEL_PREFIX}${currency}`;
        request.settlementGranularity = SettlementModelGranularity.NET;
        request.settlementInterchange = SettlementModelInterchange.MULTILATERAL;
        request.settlementDelay = SettlementModelDelay.DEFERRED;
        request.requireLiquidityCheck = true;
        request.ledgerAccountType = SettlementModelLedgerAccountType.POSITION;
        request.autoPositionReset = true;
        request.currency = currency;
        request.settlementAccountType = CentralLedgerFacade.SETTLEMENT_ACCOUNT_TYPE;

        return request;
    }

    private async createHubAccount(
        currency: FspiopCurrency,
        ledgerAccountType: string,
    ): Promise<void> {
        try {
            await this.centralLedgerAxios.createParticipantAccounts(
                CentralLedgerFacade.HUB_NAME,
                CentralLedgerFacade.toCreateHubAccountRequest(currency, ledgerAccountType),
            );
        } catch (error) {
            CentralLedgerFacade.rethrowAsPivotalException(error);

            throw error;
        }
    }

    private async resolvePositionAccount(
        name: string,
        currency: FspiopCurrency,
        participant: CentralLedgerParticipant,
    ): Promise<CentralLedgerAccount> {
        const createdAccount = CentralLedgerFacade.findPositionAccount(participant, currency);

        if (createdAccount != null) {
            return createdAccount;
        }

        const currentParticipant = await this.centralLedgerAxios.getParticipant(name);
        const currentAccount = CentralLedgerFacade.findPositionAccount(currentParticipant, currency);

        if (currentAccount != null) {
            return currentAccount;
        }

        throw new CentralLedgerException(
            `Unable to resolve ${CentralLedgerFacade.POSITION_ACCOUNT_TYPE} account for ${name} (${currency}).`,
        );
    }

    private static findPositionAccount(
        participant: CentralLedgerParticipant,
        currency: FspiopCurrency,
    ): CentralLedgerAccount | undefined {
        return participant.accounts?.find((account) => {
            return account.ledgerAccountType === CentralLedgerFacade.POSITION_ACCOUNT_TYPE
                && account.currency === currency;
        });
    }

    async registerEndpoints(name: string, endpoint: string): Promise<void> {
        await this.registerParticipantEndpoints(name, endpoint);
    }

    async registerParticipantEndpoints(name: string, endpoint: string): Promise<void> {
        try {
            for (const definition of CentralLedgerFacade.PARTICIPANT_ENDPOINTS) {
                const request = new PostParticipantsNameEndpointsRequest();
                request.type = definition.type;
                request.value = CentralLedgerFacade.buildEndpointValue(endpoint, definition.path);

                await this.centralLedgerAxios.upsertParticipantEndpoints(name, request);
            }
        } catch (error) {
            CentralLedgerFacade.rethrowAsPivotalException(error);

            throw error;
        }
    }

    private static buildEndpointValue(baseEndpoint: string, path?: string): string {
        const normalizedBaseEndpoint = baseEndpoint.endsWith('/')
            ? baseEndpoint.slice(0, -1)
            : baseEndpoint;

        if (path == null || path.length === 0) {
            return normalizedBaseEndpoint;
        }

        return `${normalizedBaseEndpoint}${path}`;
    }
}
