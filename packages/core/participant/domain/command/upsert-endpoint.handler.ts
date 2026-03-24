import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {
    CentralLedgerAxios,
    CentralLedgerException,
    PostParticipantsNameEndpointsRequest,
} from '@shared/central-ledger';
import {PivotalException} from '@shared/foundation/exception/pivotal-exception';
import {DbTarget} from '@shared/typeorm';
import {ParticipantRepository} from '../repository';
import {UpsertEndpointCommand} from './upsert-endpoint.command';

interface CentralLedgerEndpointDefinition {
    type: string;
    path?: string;
}

@CommandHandler(UpsertEndpointCommand)
export class UpsertEndpointHandler
    implements ICommandHandler<UpsertEndpointCommand, UpsertEndpointCommand.Output> {

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
        {type: 'FSPIOP_CALLBACK_URL_QUOTES_ERROR', path: '/quotes/{{ID}}/error'},
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

    private static toParticipantNotFoundError(name: string): PivotalException {
        return new PivotalException('PARTICIPANT_NOT_FOUND', `Participant not found for name: ${name}`);
    }

    private static rethrowAsPivotalException(error: unknown): void {
        if (error instanceof PivotalException) {
            throw error;
        }

        if (error instanceof CentralLedgerException) {
            throw new PivotalException(error.code, error.description);
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

    constructor(
        @Inject(CentralLedgerAxios)
        private readonly centralLedgerAxios: CentralLedgerAxios,
        @Inject(ParticipantRepository)
        private readonly repository: ParticipantRepository,
    ) {
    }

    async execute(command: UpsertEndpointCommand): Promise<UpsertEndpointCommand.Output> {
        const participant = await this.repository.findByName(command.input.name, DbTarget.Write);

        if (participant == null) {
            throw UpsertEndpointHandler.toParticipantNotFoundError(command.input.name);
        }

        try {
            for (const definition of UpsertEndpointHandler.PARTICIPANT_ENDPOINTS) {
                const request = new PostParticipantsNameEndpointsRequest();
                request.type = definition.type;
                request.value = UpsertEndpointHandler.buildEndpointValue(command.input.endpoint, definition.path);

                await this.centralLedgerAxios.upsertParticipantEndpoints(command.input.name, request);
            }
        } catch (error) {
            UpsertEndpointHandler.rethrowAsPivotalException(error);

            throw error;
        }

        return new UpsertEndpointCommand.Output(participant.id);
    }
}
