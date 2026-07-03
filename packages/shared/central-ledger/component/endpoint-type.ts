// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
export interface CentralLedgerEndpointDefinition {
    type: string;
    path?: string;
}

export const PARTICIPANT_ENDPOINT_TYPES: ReadonlyArray<CentralLedgerEndpointDefinition> = [
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
