// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {PartyIdType, TransactionInitiatorType, TransactionScenario} from '@shared/fspiop';

export class TransactionMessage<TContent = TransactionMessage.Content> {

    constructor(
        public readonly phase: TransactionMessage.InvocationPhase,
        public readonly action: TransactionMessage.InvocationAction,
        public readonly gateway: TransactionMessage.InvocationGateway,
        public readonly content: TContent,
    ) {
    }

    static request<TContent>(
        phase: TransactionMessage.InvocationPhase,
        gateway: TransactionMessage.InvocationGateway,
        content: TContent,
    ): TransactionMessage<TContent> {
        return new TransactionMessage(
            phase,
            TransactionMessage.InvocationAction.Request,
            gateway,
            content,
        );
    }

    static response<TContent>(
        phase: TransactionMessage.InvocationPhase,
        gateway: TransactionMessage.InvocationGateway,
        content: TContent,
    ): TransactionMessage<TContent> {
        return new TransactionMessage(
            phase,
            TransactionMessage.InvocationAction.Response,
            gateway,
            content,
        );
    }

    static error<TContent>(
        phase: TransactionMessage.InvocationPhase,
        gateway: TransactionMessage.InvocationGateway,
        content: TContent,
    ): TransactionMessage<TContent> {
        return new TransactionMessage(
            phase,
            TransactionMessage.InvocationAction.Error,
            gateway,
            content,
        );
    }
}

export namespace TransactionMessage {

    export enum InvocationPhase {
        Parties = 'PARTIES',
        Quotes = 'QUOTES',
        Transfers = 'TRANSFERS',
        Patch = 'PATCH',
    }

    export enum InvocationAction {
        Request = 'REQUEST',
        Response = 'RESPONSE',
        Error = 'ERROR',
    }

    export enum InvocationGateway {
        Outbound = 'OUTBOUND',
        Inbound = 'INBOUND',
        Connector = 'CONNECTOR',
    }

    export interface BaseContent {
        correlationId: string;
        payerFsp: string;
        payeeFsp: string;
        occurredAt?: Date | string | null;
    }

    export interface PartiesContent extends BaseContent {
        payerIdType?: PartyIdType | null;
        payerId?: string | null;
        payerSubId?: string | null;
        payeeIdType?: PartyIdType | null;
        payeeId?: string | null;
        payeeSubId?: string | null;
        transactionInitiatorType?: TransactionInitiatorType | null;
        transactionType?: TransactionScenario | null;
        subScenario?: string | null;
        payerHomeTransactionId?: string | null;
        request?: unknown | null;
        response?: unknown | null;
        error?: unknown | null;
    }

    export interface QuotesContent extends BaseContent {
        request?: unknown | null;
        response?: unknown | null;
        error?: unknown | null;
    }

    export interface TransfersContent extends BaseContent {
        request?: unknown | null;
        response?: unknown | null;
        error?: unknown | null;
    }

    export interface PatchContent extends BaseContent {
        request?: unknown | null;
        response?: unknown | null;
        error?: string | null;
        homeTransactionId?: string | null;
    }

    export type Content = PartiesContent | QuotesContent | TransfersContent | PatchContent;
}
