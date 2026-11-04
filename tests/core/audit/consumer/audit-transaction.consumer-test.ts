import 'reflect-metadata';
import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {JsMsg} from 'nats';
import {AuditTransactionConsumer} from '../../../../packages/core/audit/consumer/listener/audit-transaction.consumer';
import {TransactionMessage} from '../../../../packages/core/audit/common';
import {AuditPatchResolvedCommand} from '../../../../packages/core/audit/domain';

type FailureApi = {
    handleProcessingFailure(msg: JsMsg, message: TransactionMessage, error: unknown): void;
};
type StaticApi = {
    isPermanentDbError(error: unknown): boolean;
    MAX_DELIVERY_ATTEMPTS: number;
};
type DispatchApi = {
    dispatch(message: TransactionMessage): Promise<void>;
};

const staticApi = AuditTransactionConsumer as unknown as StaticApi;

function newConsumer(): FailureApi {
    // Constructor only stores its collaborators; the failure path uses none of them.
    return new AuditTransactionConsumer({} as never, {} as never) as unknown as FailureApi;
}

function newDispatchConsumer(commandBus: {execute(command: unknown): Promise<unknown>}): DispatchApi {
    return new AuditTransactionConsumer({} as never, commandBus as never) as unknown as DispatchApi;
}

function fakeMsg(redeliveryCount: number): {msg: JsMsg; calls: {term: number; nak: number}} {
    const calls = {term: 0, nak: 0};
    const msg = {
        info: {redeliveryCount},
        term(): void { calls.term++; },
        nak(): void { calls.nak++; },
        ack(): void { /* not expected on the failure path */ },
    } as unknown as JsMsg;

    return {msg, calls};
}

const message = {phase: 'PARTIES', action: 'REQUEST', content: {correlationId: 'c1'}} as unknown as TransactionMessage;

function dbError(errno: number | undefined, viaDriverError = false): Error {
    const error = new Error('simulated db failure');
    if (errno === undefined) {
        return error;
    }

    return viaDriverError
        ? Object.assign(error, {driverError: {errno}})
        : Object.assign(error, {errno});
}

describe('AuditTransactionConsumer.isPermanentDbError', () => {

    it('flags ER_DATA_TOO_LONG (1406) as permanent', () => {
        assert.equal(staticApi.isPermanentDbError(dbError(1406)), true);
    });

    it('reads errno from a wrapped driverError (TypeORM QueryFailedError shape)', () => {
        assert.equal(staticApi.isPermanentDbError(dbError(1406, true)), true);
    });

    it('does not flag a transient/unknown errno', () => {
        assert.equal(staticApi.isPermanentDbError(dbError(1205)), false); // ER_LOCK_WAIT_TIMEOUT
    });

    it('does not flag an error without an errno', () => {
        assert.equal(staticApi.isPermanentDbError(dbError(undefined)), false);
    });
});

describe('AuditTransactionConsumer.handleProcessingFailure', () => {

    it('terminates a permanent error on the first attempt (no retry)', () => {
        const {msg, calls} = fakeMsg(1);

        newConsumer().handleProcessingFailure(msg, message, dbError(1406));

        assert.equal(calls.term, 1);
        assert.equal(calls.nak, 0);
    });

    it('retries a transient error while under the attempt cap', () => {
        const {msg, calls} = fakeMsg(1);

        newConsumer().handleProcessingFailure(msg, message, dbError(undefined));

        assert.equal(calls.nak, 1);
        assert.equal(calls.term, 0);
    });

    it('terminates any error once the attempt cap is reached (backstop)', () => {
        const {msg, calls} = fakeMsg(staticApi.MAX_DELIVERY_ATTEMPTS);

        newConsumer().handleProcessingFailure(msg, message, dbError(undefined));

        assert.equal(calls.term, 1);
        assert.equal(calls.nak, 0);
    });
});

describe('AuditTransactionConsumer resolved patch dispatch', () => {

    it('dispatches connector PATCH RESOLVED messages using correlationId and occurredAt', async () => {
        const executed: unknown[] = [];
        const consumer = newDispatchConsumer({
            async execute(command: unknown): Promise<void> {
                executed.push(command);
            },
        });

        await consumer.dispatch(
            TransactionMessage.resolved(
                TransactionMessage.InvocationPhase.Patch,
                TransactionMessage.InvocationGateway.Connector,
                {
                    correlationId: 'transfer-1',
                    occurredAt: '2026-10-07T10:15:30.123Z',
                },
            ),
        );

        assert.equal(executed.length, 1);
        assert.equal(executed[0] instanceof AuditPatchResolvedCommand, true);
        const command = executed[0] as AuditPatchResolvedCommand;
        assert.equal(command.input.correlationId, 'transfer-1');
        assert.equal(command.input.occurredAt.toISOString(), '2026-10-07T10:15:30.123Z');
    });

    it('ignores PATCH RESOLVED messages from non-connector gateways', async () => {
        const executed: unknown[] = [];
        const consumer = newDispatchConsumer({
            async execute(command: unknown): Promise<void> {
                executed.push(command);
            },
        });

        await consumer.dispatch(
            TransactionMessage.resolved(
                TransactionMessage.InvocationPhase.Patch,
                TransactionMessage.InvocationGateway.Outbound,
                {
                    correlationId: 'transfer-1',
                    occurredAt: '2026-10-07T10:15:30.123Z',
                },
            ),
        );

        assert.equal(executed.length, 0);
    });

    it('ignores PATCH RESOLVED messages with invalid payloads', async () => {
        const executed: unknown[] = [];
        const consumer = newDispatchConsumer({
            async execute(command: unknown): Promise<void> {
                executed.push(command);
            },
        });

        await consumer.dispatch(
            TransactionMessage.resolved(
                TransactionMessage.InvocationPhase.Patch,
                TransactionMessage.InvocationGateway.Connector,
                {
                    correlationId: '',
                    occurredAt: 'not-a-date',
                },
            ),
        );

        assert.equal(executed.length, 0);
    });
});
