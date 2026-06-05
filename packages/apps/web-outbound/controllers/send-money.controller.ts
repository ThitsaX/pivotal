import { Body, Controller, Headers, Inject, Logger, Param, Post, Put } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { Transform } from 'class-transformer';
import { PostSendMoneyCommand, PutAcceptPartyCommand, PutAcceptQuoteCommand, SendMoneyRequest, SendMoneyResponse, } from '@core/outbound/domain';
import { ExtensionList, FspiopErrors, FspiopException, FspiopHeaders, FspiopMoney, IsFspiopAmount, } from '@shared/fspiop';
import { Ulid } from "@shared/ulid";
import { IsBoolean, IsOptional, ValidateIf } from 'class-validator';

export class PutSendMoneyRequest {
    @IsOptional()
    @Transform(({ value }) => value === true || value === 'true')
    @IsBoolean()
    acceptParty?: boolean;

    @ValidateIf((request: PutSendMoneyRequest) => request.acceptParty === true)
    @Transform(({ value }) => typeof value === 'string' ? FspiopMoney.normalizeAmount(value) : value)
    @IsFspiopAmount()
    amount?: string;

    @IsOptional()
    extensionList?: ExtensionList;

    @IsOptional()
    @Transform(({ value }) => value === true || value === 'true')
    @IsBoolean()
    acceptQuote?: boolean;
}

@Controller('secured/sendmoney')
export class SendMoneyController {

    private readonly logger = new Logger(SendMoneyController.name);

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

        this.logger.log(
            `Post SendMoney Request for fromIdValue ${request.from?.idValue} toIdValue ${request.to?.idValue} : ${JSON.stringify(request)}`,
        );
        const correlationId = Ulid.generate();
        const payerFsp = SendMoneyController.toSource(source, request);
        const input = new PostSendMoneyCommand.Input(correlationId, payerFsp, request);

        const output: PostSendMoneyCommand.Output = await this.commandBus.execute(
            new PostSendMoneyCommand(input),
        );

        this.logger.log(`Post SendMoney Response for TransferId ${output.response.transferId} : ${JSON.stringify(output.response)}`);

        return output.response;
    }

    @Put(':transferId')
    async put(
        @Param('transferId') transferId: string,
        @Body() request: PutSendMoneyRequest,
    ): Promise<SendMoneyResponse> {
        if (request.acceptParty != null) {
            this.logger.log(
                `Put SendMoney Accept Party Request for TransferId ${transferId} : ${JSON.stringify(request)}`,
            );
            const output: PutAcceptPartyCommand.Output = await this.commandBus.execute(
                new PutAcceptPartyCommand(
                    new PutAcceptPartyCommand.Input(
                        transferId,
                        request.acceptParty,
                        request.amount ?? '',
                        request.extensionList,
                    ),
                ),
            );
            this.logger.log(
                `Put SendMoney Accept Party Response for TransferId ${transferId} : ${JSON.stringify(output)}`,
            );
            return output.response;
        }

        if (request.acceptQuote != null) {
            this.logger.log(
                `Put SendMoney Accept Quote Request for TransferId ${transferId} : ${JSON.stringify(request)}`,
            );
            const output: PutAcceptQuoteCommand.Output = await this.commandBus.execute(
                new PutAcceptQuoteCommand(
                    new PutAcceptQuoteCommand.Input(transferId, request.acceptQuote),
                ),
            );
            this.logger.log(
                `Put SendMoney Accept Quote Response for TransferId ${transferId} : ${JSON.stringify(output)}`,
            );
            return output.response;
        }

        throw new FspiopException(
            FspiopErrors.MISSING_MANDATORY_ELEMENT,
            {
                extension: [
                    {
                        key: '',
                        value: 'acceptParty or acceptQuote is required.',
                    },
                ],
            },
        );
    }
}
