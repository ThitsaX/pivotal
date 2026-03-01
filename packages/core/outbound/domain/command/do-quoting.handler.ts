import {CommandHandler, ICommandHandler} from '@nestjs/cqrs';
import {
    FspiopAxios,
    FspiopAxiosError,
    FspiopErrors,
    FspiopException,
    FspiopHeaders,
    FspiopPubSubSubjects,
    FspiopResponseSubscriber,
    QuotesIDPutResponse,
} from '@shared/fspiop';
import {DoQuotingCommand} from './do-quoting.command';

@CommandHandler(DoQuotingCommand)
export class DoQuotingHandler
    implements ICommandHandler<DoQuotingCommand, DoQuotingCommand.Output> {

    constructor(
        private readonly fspiopAxios: FspiopAxios,
        private readonly subscriber: FspiopResponseSubscriber,
    ) {
    }

    async execute(command: DoQuotingCommand): Promise<DoQuotingCommand.Output> {
        const {source, destination, quoteId, request} = command.input;
        const {switchBaseUrl, switchId} = this.fspiopAxios.settings;

        const headers = FspiopHeaders.Values.Quotes.forRequest(source, switchId);

        // Quotes carry a unique quoteId — a single error subject is sufficient,
        // no hub error subject is needed (unlike Parties).
        const successSubject = FspiopPubSubSubjects.Quotes.forSuccess(source, destination, quoteId);
        const errorSubject   = FspiopPubSubSubjects.Quotes.forError(source, destination, quoteId);

        // ── Step 1: Subscribe to NATS BEFORE sending the request ─────────────
        // nc.subscribe() is synchronous — subscriptions are active immediately.
        // Even if the switch responds before we reach Step 3, NATS buffers the
        // message for the active subscription, eliminating the race condition.
        const waitPromise = this.subscriber.waitFor<QuotesIDPutResponse>(
            successSubject,
            errorSubject,
        );

        // ── Step 2: Fire the POST /quotes request ─────────────────────────────
        try {
            await this.fspiopAxios
                .withHeaders(headers)
                .postQuotes(switchBaseUrl, request);
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
        // Resolves on PUT /quotes/{ID} success, rejects with FspiopException
        // on error or timeout (SERVER_TIMED_OUT after DEFAULT_TIMEOUT_MS).
        const response = await waitPromise;

        return new DoQuotingCommand.Output(response);
    }
}
