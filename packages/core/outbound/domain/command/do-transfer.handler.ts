import {Inject} from '@nestjs/common';
import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {
    FspiopAxios,
    FspiopAxiosError,
    FspiopErrors,
    FspiopException,
    FspiopHeaders,
    FspiopPubSubSubjects,
    FspiopResponseSubscriber,
    TransfersIDPutResponse,
} from '@shared/fspiop';
import {DoTransferCommand} from './do-transfer.command';

@CommandHandler(DoTransferCommand)
export class DoTransferHandler
    implements ICommandHandler<DoTransferCommand, DoTransferCommand.Output> {

    constructor(
        @Inject(FspiopAxios)
        private readonly fspiopAxios: FspiopAxios,
        @Inject(FspiopResponseSubscriber)
        private readonly subscriber: FspiopResponseSubscriber,
    ) {
    }

    async execute(command: DoTransferCommand): Promise<DoTransferCommand.Output> {
        const {source, destination, transferId, transferRequest} = command.input;
        const {transfersUrl, switchId} = this.fspiopAxios.settings;

        const headers = FspiopHeaders.Values.Transfers.forRequest(source, destination);

        // Transfers carry a unique transferId — a single error subject is sufficient,
        // no hub error subject is needed (unlike Parties).
        const successSubject = FspiopPubSubSubjects.Transfers.forSuccess(source, destination, transferId);
        const errorSubject   = FspiopPubSubSubjects.Transfers.forError(source, destination, transferId);

        // ── Step 1: Subscribe to NATS BEFORE sending the request ─────────────
        // nc.subscribe() is synchronous — subscriptions are active immediately.
        // Even if the switch responds before we reach Step 3, NATS buffers the
        // message for the active subscription, eliminating the race condition.
        const waitPromise = this.subscriber.waitFor<TransfersIDPutResponse>(
            successSubject,
            errorSubject,
        );

        // ── Step 2: Fire the POST /transfers request ──────────────────────────
        try {
            await this.fspiopAxios
                .withHeaders(headers)
                .postTransfers(transfersUrl, transferRequest);
        } catch (error) {
            // Cancel the NATS subscriptions immediately — no callback will arrive.
            this.subscriber.cancel(successSubject);

            if (FspiopAxiosError.is(error)) {
                const info = error.errorInformationResponse?.errorInformation;
                const code = info?.errorCode ?? '';
                const desc = info?.errorDescription ?? 'Communication error';
                const extensionList = info?.extensionList;
                const errorDef = FspiopErrors.find(code) ?? FspiopErrors.COMMUNICATION_ERROR;
                throw new FspiopException(errorDef, desc, extensionList);
            }

            throw error;
        }

        // ── Step 3: Await the callback ────────────────────────────────────────
        // Resolves on PUT /transfers/{ID} success, rejects with FspiopException
        // on error or timeout (SERVER_TIMED_OUT after DEFAULT_TIMEOUT_MS).
        const response = await waitPromise;

        return DoTransferCommand.Output.fromCallback(response);
    }
}
