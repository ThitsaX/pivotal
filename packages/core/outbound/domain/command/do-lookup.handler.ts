import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {
    FspiopAxios,
    FspiopAxiosError,
    FspiopErrors,
    FspiopException,
    FspiopHeaders,
    FspiopPubSubSubjects,
    FspiopResponseSubscriber,
    PartiesTypeIDPutResponse,
} from '@shared/fspiop';
import {DoLookupCommand} from './do-lookup.command';

@CommandHandler(DoLookupCommand)
export class DoLookupHandler
    implements ICommandHandler<DoLookupCommand, DoLookupCommand.Output> {

    constructor(
        private readonly fspiopAxios: FspiopAxios,
        private readonly subscriber: FspiopResponseSubscriber,
    ) {
    }

    async execute(command: DoLookupCommand): Promise<DoLookupCommand.Output> {
        const {source, destination, type, id, subId} = command.input;
        const {switchBaseUrl, switchId} = this.fspiopAxios.settings;

        const headers = FspiopHeaders.Values.Parties.forRequest(source, switchId);

        // Build NATS pub/sub subjects for this lookup.
        // Success / FSP error: the responding payee DFSP is the source, we are the destination.
        const successSubject = FspiopPubSubSubjects.Parties.forSuccess(source, destination, type, id, subId);
        const errorSubject = FspiopPubSubSubjects.Parties.forError(source, destination, type, id, subId);
        // Hub error: the hub itself originates the error (source=switchId, destination=source/us).
        // However, although the hub is a source, we can assume it as the payee, and we are the payer.
        const hubErrorSubject = FspiopPubSubSubjects.Parties.forError(source, switchId, type, id, subId);

        // ── Step 1: Subscribe to NATS BEFORE sending the request ─────────────
        // nc.subscribe() is synchronous — subscriptions are active immediately.
        // Even if the switch responds before we reach Step 3, NATS buffers the
        // message for the active subscription, eliminating the race condition.
        const waitPromise = this.subscriber.waitFor<PartiesTypeIDPutResponse>(
            successSubject,
            errorSubject,
            hubErrorSubject,
        );

        // ── Step 2: Fire the GET /parties request ─────────────────────────────
        try {
            await this.fspiopAxios
                .withHeaders(headers)
                .getParties(switchBaseUrl, type, id, subId);
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
        // Resolves on parties success, rejects with FspiopException on error or
        // timeout (SERVER_TIMED_OUT after DEFAULT_TIMEOUT_MS).
        const response = await waitPromise;

        return new DoLookupCommand.Output(response);
    }
}
