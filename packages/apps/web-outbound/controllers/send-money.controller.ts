import {Body, Controller, Headers, Inject, Param, Post, Put} from '@nestjs/common';
import {CommandBus} from '@nestjs/cqrs';
import {PostSendMoneyCommand, PutAcceptPartyCommand, PutAcceptQuoteCommand, SendMoneyRequest, SendMoneyResponse,} from '@core/outbound/domain';
import {FspiopErrors, FspiopException, FspiopHeaders,} from '@shared/fspiop';
import {Ulid} from "@shared/ulid";

class PutSendMoneyRequest {
    acceptParty?: boolean;

    acceptQuote?: boolean;
}

@Controller('secured/sendmoney')
export class SendMoneyController {

    constructor(
        @Inject(CommandBus)
        private readonly commandBus: CommandBus,
    ) {
    }

    private static toSource(source: string | undefined, request: SendMoneyRequest): string {
        const normalizedSource = source?.trim();

        if (normalizedSource != null && normalizedSource.length > 0) {
            return normalizedSource;
        }

        const payerFsp = request.from?.fspId?.trim();

        if (payerFsp == null || payerFsp.length === 0) {
            throw new FspiopException(
                FspiopErrors.MISSING_MANDATORY_ELEMENT,
                'fspiop-source header or request.from.fspId is required.',
            );
        }

        return payerFsp;
    }

    @Post()
    async post(
        @Headers(FspiopHeaders.Names.FSPIOP_SOURCE) source: string,
        @Body() request: SendMoneyRequest,
    ): Promise<SendMoneyResponse> {

        const correlationId = Ulid.generate();
        const payerFsp = SendMoneyController.toSource(source, request);
        const input = new PostSendMoneyCommand.Input(correlationId, payerFsp, request);

        const output: PostSendMoneyCommand.Output = await this.commandBus.execute(
            new PostSendMoneyCommand(input),
        );

        return output.response;
    }

    @Put(':transferId')
    async put(
        @Param('transferId') transferId: string,
        @Body() request: PutSendMoneyRequest,
    ): Promise<SendMoneyResponse> {
        if (request.acceptParty != null) {
            const output: PutAcceptPartyCommand.Output = await this.commandBus.execute(
                new PutAcceptPartyCommand(
                    new PutAcceptPartyCommand.Input(transferId, request.acceptParty),
                ),
            );

            return output.response;
        }

        if (request.acceptQuote != null) {
            const output: PutAcceptQuoteCommand.Output = await this.commandBus.execute(
                new PutAcceptQuoteCommand(
                    new PutAcceptQuoteCommand.Input(transferId, request.acceptQuote),
                ),
            );

            return output.response;
        }

        throw new FspiopException(
            FspiopErrors.MISSING_MANDATORY_ELEMENT,
            'acceptParty or acceptQuote is required.',
        );
    }
}
